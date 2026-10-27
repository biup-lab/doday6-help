import sys, re
from html.parser import HTMLParser

BLOCK = {"p", "div", "li", "tr", "section", "figure", "figcaption", "ul", "ol", "table", "br", "dt", "dd", "pre", "blockquote", "aside"}


class P(HTMLParser):
    def __init__(self):
        super().__init__()
        self.inmain = 0
        self.skip = 0
        self.out = []
        self.cell = False

    def handle_starttag(self, tag, attrs):
        if tag == "main":
            self.inmain += 1
        if not self.inmain:
            return
        if tag in ("script", "style", "svg", "nav"):
            self.skip += 1
            return
        if self.skip:
            return
        if tag in ("h1", "h2", "h3", "h4"):
            self.out.append("\n\n" + {"h1": "# ", "h2": "## ", "h3": "### ", "h4": "#### "}[tag])
        elif tag == "li":
            self.out.append("\n- ")
        elif tag == "figcaption":
            self.out.append("\n[화면 설명] ")
        elif tag in ("td", "th"):
            self.out.append(" | ")
        elif tag in BLOCK:
            self.out.append("\n")

    def handle_endtag(self, tag):
        if not self.inmain:
            return
        if tag in ("script", "style", "svg", "nav"):
            self.skip -= 1
            return
        if tag == "main":
            self.inmain -= 1
        if self.skip:
            return
        if tag in ("h1", "h2", "h3", "h4") or tag in BLOCK:
            self.out.append("\n")

    def handle_data(self, d):
        if self.inmain and not self.skip:
            self.out.append(re.sub(r"\s+", " ", d))


for path in sys.argv[1:]:
    p = P()
    p.feed(open(path, encoding="utf-8").read())
    t = "".join(p.out)
    t = re.sub(r"[ \t]+\n", "\n", t)
    t = re.sub(r"\n[ \t]+", "\n", t)
    t = re.sub(r"\n{3,}", "\n\n", t)
    print(t.strip())
    print("\n\n========================================\n")
