#!/usr/bin/env python3
"""Generate the intentionally messy EPUB fixture used by the importer tests."""
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZIP_STORED, ZipFile

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "epub" / "messy-structure.epub"

CONTAINER = """<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
"""

OPF = """<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Messy Structure</dc:title>
    <dc:creator>Fixture Author</dc:creator>
    <dc:language>en</dc:language>
    <dc:identifier id="bookid">urn:uuid:messy-structure-fixture</dc:identifier>
  </metadata>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="ch1" href="Text/ch%201.xhtml" media-type="application/xhtml+xml"/>
    <item id="ch2" href="Text/ch2.xhtml" media-type="application/xhtml+xml"/>
    <item id="pic" href="Images/dot.png" media-type="image/png"/>
    <item id="pic2" href="Images/ribbon.svg" media-type="image/svg+xml"/>
  </manifest>
  <spine toc="ncx">
    <itemref idref="ch1"/>
    <itemref idref="ch2"/>
    <itemref idref="missing"/>
  </spine>
</package>
"""

NCX = """<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head><meta name="dtb:uid" content="urn:uuid:messy-structure-fixture"/></head>
  <docTitle><text>Messy Structure</text></docTitle>
  <navMap>
    <navPoint id="n1" playOrder="1">
      <navLabel><text>Chapter One</text></navLabel>
      <content src="Text/ch%201.xhtml"/>
      <navPoint id="n1a" playOrder="2">
        <navLabel><text>A Nested Thought</text></navLabel>
        <content src="Text/ch%201.xhtml#nested"/>
      </navPoint>
    </navPoint>
    <navPoint id="n2" playOrder="3">
      <navLabel><text>Notes &amp; Pictures</text></navLabel>
      <content src="Text/ch2.xhtml"/>
    </navPoint>
  </navMap>
</ncx>
"""

CH1 = """<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>One</title><style>p { color: red }</style></head>
<body>
  <div id="top">
    <h2>Chapter One</h2>
    <p>This paragraph has <em>emphasis</em>, <strong>strength</strong>, and a broken line<br/>that continues.</p>
    <p>Text with a reference<a epub:type="noteref" href="#fn1">1</a> and a silly anchor<a href="#fn2"><sup>2</sup></a>.</p>
    <div>Bare text inside a div with&nbsp;non-breaking space and <script>ignored()</script> tail.</div>
    <blockquote>Quoted words<footer epub:type="footnote" id="fn1"><p>First footnote body.</p></footer></blockquote>
    <p>Before note two.<aside epub:type="footnote" id="fn2"><em>Second</em> footnote body.</aside>After note two.</p>
    <ul><li>First item</li><li>Second <i>item</i></li></ul>
    <p id="nested">Nested target paragraph.</p>
    <img src="../Images/dot.png" alt="A dot"/>
    <p><img src="../Images/ribbon.svg" alt="A ribbon" width="120" height="30"/></p>
    <table><tr><th>Name</th><th>Value</th></tr><tr><td>alpha</td><td>1</td></tr></table>
    <hr/>
  </div>
</body>
</html>
"""

CH2 = """<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Two</title><script>evil()</script></head>
<body>
  <h2>Notes &amp; Pictures</h2>
  <p>Chapter two links back to <a href="ch%201.xhtml#nested">the nested paragraph</a>.</p>
  <section epub:type="endnotes" role="doc-endnotes">
    <aside id="en1" epub:type="endnote" role="doc-endnote"><p>An endnote in its own section.</p></aside>
  </section>
  <p>Closing words with entity &amp; ampersand.</p>
</body>
</html>
"""

PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d4948445200000002000000020806000000f47821"
    "4c0000000d49444154789c6360000002000100fd4d6a8d0000000049454e44ae426082"
)
SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 30"><rect width="120" height="30" fill="red"/></svg>
"""


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(OUT, "w") as zf:
        zf.writestr("mimetype", "application/epub+zip", compress_type=ZIP_STORED)
        zf.writestr("META-INF/container.xml", CONTAINER, compress_type=ZIP_DEFLATED)
        zf.writestr("OEBPS/content.opf", OPF, compress_type=ZIP_DEFLATED)
        zf.writestr("OEBPS/toc.ncx", NCX, compress_type=ZIP_DEFLATED)
        zf.writestr("OEBPS/Text/ch 1.xhtml", CH1, compress_type=ZIP_DEFLATED)
        zf.writestr("OEBPS/Text/ch2.xhtml", CH2, compress_type=ZIP_DEFLATED)
        zf.writestr("OEBPS/Images/dot.png", PNG, compress_type=ZIP_DEFLATED)
        zf.writestr("OEBPS/Images/ribbon.svg", SVG, compress_type=ZIP_DEFLATED)
    print(f"wrote {OUT} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
