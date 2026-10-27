// 구글 시트에 붙이는 질문 기록용 Apps Script.
// 시트 메뉴 확장 프로그램 › Apps Script 에 이 내용을 통째로 붙여 넣고,
// 아래 SECRET 을 Vercel 환경 변수 SHEET_SECRET 과 똑같은 값으로 바꾼 뒤 웹 앱으로 배포한다.
const SECRET = "여기에-아무도-모르는-긴-비밀번호";

function doPost(e) {
  const d = JSON.parse(e.postData.contents);
  if (d.secret !== SECRET) return ContentService.createTextOutput("no");

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  if (sheet.getLastRow() === 0) sheet.appendRow(["일시(한국)", "질문", "대화 번호", "막힘"]);
  sheet.appendRow([d.kst, plain(d.text), plain(d.chat), d.stuck ? "예" : ""]);
  return ContentService.createTextOutput("ok");
}

// = + - @ 로 시작하는 질문이 수식으로 바뀌지 않게 글자로 넣는다
function plain(v) {
  const s = String(v || "");
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}
