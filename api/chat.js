// POST /api/chat — 화면에서 보낸 대화를 Claude에게 넘기고, 답을 한 줄씩(NDJSON) 흘려보낸다.
// API 키는 Vercel 환경 변수 ANTHROPIC_API_KEY 에만 둔다. 화면(public/)에는 키가 없다.
//
// 보내는 줄:  {"t":"글자 조각"} ... {"done":true,"truncated":false}
// 오류일 때:  {"error":"rate_limited"} 처럼 한 줄 (화면이 알맞은 안내 문구로 바꿔 보여 준다)
import Anthropic from "@anthropic-ai/sdk";
import { RULES } from "../lib/rules.js";
import { GUIDE } from "../lib/guide.js";

const MODEL = "claude-opus-5-5";
const MAX_TURNS = 12;           // 최근 대화 몇 개까지 기억할지
const MAX_USER_CHARS = 2000;    // 질문 한 번의 최대 글자 수
const MAX_BOT_CHARS = 8000;     // 이전 답변 한 번의 최대 글자 수

// 규칙 + 사용 안내는 매번 똑같으므로 캐시해서 두 번째 질문부터는 싸고 빠르게 읽힌다.
const SYSTEM = [{
  type: "text",
  text: RULES + "\n\n<안내문>\n" + GUIDE + "\n</안내문>",
  cache_control: { type: "ephemeral" },
}];

const client = new Anthropic(); // ANTHROPIC_API_KEY 를 환경 변수에서 읽는다

export async function POST(request) {
  if (!process.env.ANTHROPIC_API_KEY) return fail(500, "no_key");
  if (!sameOrigin(request)) return fail(403, "forbidden");

  let body;
  try { body = await request.json(); } catch { return fail(400, "bad_request"); }
  const messages = cleanTurns(body && body.messages);
  if (!messages) return fail(400, "bad_request");
  if (messages[messages.length - 1].content.length > MAX_USER_CHARS) return fail(400, "too_long");

  const chat = typeof body.chat === "string" ? body.chat.slice(0, 40) : "";
  const logged = logQuestion(messages[messages.length - 1].content, chat);

  const enc = new TextEncoder();
  const line = (obj) => enc.encode(JSON.stringify(obj) + "\n");

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const s = client.beta.messages.stream({
          model: MODEL,
          max_tokens: 16000,
          output_config: { effort: "low" },
          // 안전 필터가 드물게 답을 거절하면 Anthropic이 권하는 다른 모델로 자동으로 다시 답한다.
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          system: SYSTEM,
          messages,
        }, { signal: request.signal });

        for await (const ev of s) {
          if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
            controller.enqueue(line({ t: ev.delta.text }));
          }
        }
        const final = await s.finalMessage();
        if (final.stop_reason === "refusal") controller.enqueue(line({ error: "refused" }));
        else controller.enqueue(line({ done: true, truncated: final.stop_reason === "max_tokens" }));
      } catch (err) {
        if (!request.signal.aborted) controller.enqueue(line({ error: errorCode(err) }));
      } finally {
        await logged;
        try { controller.close(); } catch {}
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

// 다른 사이트에서 이 서버를 몰래 불러 쓰지 못하게, 같은 주소에서 온 요청만 받는다.
function sameOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try { return new URL(origin).host === request.headers.get("host"); } catch { return false; }
}

// 화면이 보낸 대화를 검사한다: user로 시작해 user로 끝나고, 번갈아 나오며, 너무 길지 않을 것.
function cleanTurns(raw) {
  if (!Array.isArray(raw)) return null;
  const turns = [];
  for (const m of raw.slice(-MAX_TURNS)) {
    if (!m || (m.role !== "user" && m.role !== "assistant") || typeof m.content !== "string") return null;
    const content = m.content.trim().slice(0, m.role === "user" ? MAX_USER_CHARS + 1 : MAX_BOT_CHARS);
    if (!content) continue;
    const prev = turns[turns.length - 1];
    if (prev && prev.role === m.role) prev.content += "\n\n" + content;
    else turns.push({ role: m.role, content });
  }
  while (turns.length && turns[0].role !== "user") turns.shift();
  if (!turns.length || turns[turns.length - 1].role !== "user") return null;
  return turns;
}

function errorCode(err) {
  if (err instanceof Anthropic.RateLimitError) return "rate_limited";
  if (err instanceof Anthropic.AuthenticationError) return "no_key";
  if (err instanceof Anthropic.PermissionDeniedError) return "no_key";
  if (err instanceof Anthropic.BadRequestError) return "bad_request";
  if (err instanceof Anthropic.APIError && err.status === 529) return "overloaded";
  return "server_error";
}

// 질문을 구글 시트에 한 줄 남긴다. SHEET_URL 이 없으면 아무것도 하지 않는다.
// "했어요"(다음 단계 버튼)는 남기지 않는다. 실패해도 답변에는 영향이 없다.
async function logQuestion(text, chat) {
  const url = process.env.SHEET_URL;
  if (!url || text === "했어요") return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        secret: process.env.SHEET_SECRET || "",
        kst: kstStamp(new Date()),
        text: text.slice(0, 4000),
        chat,
        stuck: text.startsWith("잘 안 돼요"),
      }),
      signal: AbortSignal.timeout(8000),
    });
  } catch {}
}

function kstStamp(d) {
  const k = new Date(d.getTime() + 9 * 3600 * 1000);
  const z = (n) => String(n).padStart(2, "0");
  return `${k.getUTCFullYear()}-${z(k.getUTCMonth() + 1)}-${z(k.getUTCDate())} ${z(k.getUTCHours())}:${z(k.getUTCMinutes())}`;
}

function fail(status, code) {
  return new Response(JSON.stringify({ error: code }) + "\n", {
    status,
    headers: { "content-type": "application/x-ndjson; charset=utf-8" },
  });
}
