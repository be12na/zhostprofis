#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import math
import re
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from xml.sax.saxutils import escape


ROOT_DIR = Path(__file__).resolve().parent.parent
DEFAULT_INPUT = ROOT_DIR / "demo-data" / "google-sheets-demo-seed.json"
DEFAULT_OUTPUT = ROOT_DIR / "demo-data" / "google-sheets-demo-import.xlsx"

REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
DOC_REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
CORE_NS = "http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
DC_NS = "http://purl.org/dc/elements/1.1/"
DCTERMS_NS = "http://purl.org/dc/terms/"
XSI_NS = "http://www.w3.org/2001/XMLSchema-instance"
APP_NS = "http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"
VT_NS = "http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"

INVALID_XML_RE = re.compile(r"[\x00-\x08\x0B\x0C\x0E-\x1F]")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Export demo Google Sheets seed JSON to a multi-sheet XLSX workbook."
    )
    parser.add_argument(
        "--input",
        type=Path,
        default=DEFAULT_INPUT,
        help=f"Path to seed JSON. Default: {DEFAULT_INPUT}",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help=f"Path to XLSX output. Default: {DEFAULT_OUTPUT}",
    )
    return parser.parse_args()


def sanitize_text(value: Any) -> str:
    return INVALID_XML_RE.sub("", str(value))


def xml_text(value: Any) -> str:
    return escape(sanitize_text(value))


def xml_attr(value: Any) -> str:
    return escape(sanitize_text(value), {'"': "&quot;"})


def column_name(index: int) -> str:
    if index < 1:
        raise ValueError("Column index must be >= 1.")
    label = []
    while index:
        index, remainder = divmod(index - 1, 26)
        label.append(chr(65 + remainder))
    return "".join(reversed(label))


def cell_reference(row_index: int, column_index: int) -> str:
    return f"{column_name(column_index)}{row_index}"


def is_number(value: Any) -> bool:
    if isinstance(value, bool):
        return False
    if isinstance(value, (int, float)):
        return math.isfinite(value)
    return False


def build_cell_xml(row_index: int, column_index: int, value: Any, style_id: int = 0) -> str:
    if value is None:
        return ""

    ref = cell_reference(row_index, column_index)
    style_attr = f' s="{style_id}"' if style_id else ""

    if isinstance(value, bool):
        return f'<c r="{ref}"{style_attr} t="b"><v>{"1" if value else "0"}</v></c>'

    if is_number(value):
        numeric_value = format(value, "g") if isinstance(value, float) else str(value)
        return f'<c r="{ref}"{style_attr}><v>{numeric_value}</v></c>'

    return (
        f'<c r="{ref}"{style_attr} t="inlineStr">'
        f"<is><t xml:space=\"preserve\">{xml_text(value)}</t></is>"
        f"</c>"
    )


def build_sheet_xml(sheet_name: str, headers: list[Any], rows: list[list[Any]]) -> str:
    total_rows = len(rows) + 1
    total_cols = len(headers) or 1
    last_cell = cell_reference(total_rows or 1, total_cols)
    row_xml_parts: list[str] = []

    header_cells = [
        build_cell_xml(1, col_index, header, style_id=1)
        for col_index, header in enumerate(headers, start=1)
    ]
    row_xml_parts.append(f'<row r="1" spans="1:{total_cols}">{"".join(header_cells)}</row>')

    for row_index, row in enumerate(rows, start=2):
        cells: list[str] = []
        for col_index, value in enumerate(row, start=1):
            cell_xml = build_cell_xml(row_index, col_index, value)
            if cell_xml:
                cells.append(cell_xml)
        row_xml_parts.append(f'<row r="{row_index}" spans="1:{total_cols}">{"".join(cells)}</row>')

    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        f'<worksheet xmlns="{MAIN_NS}" xmlns:r="{DOC_REL_NS}">'
        f'<dimension ref="A1:{last_cell}"/>'
        "<sheetViews>"
        '<sheetView workbookViewId="0">'
        '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>'
        '<selection pane="bottomLeft" activeCell="A2" sqref="A2"/>'
        "</sheetView>"
        "</sheetViews>"
        '<sheetFormatPr defaultRowHeight="15"/>'
        f"<sheetData>{''.join(row_xml_parts)}</sheetData>"
        '<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>'
        "</worksheet>"
    )


def build_workbook_xml(sheet_names: list[str]) -> str:
    sheets_xml = "".join(
        f'<sheet name="{xml_attr(name)}" sheetId="{index}" r:id="rId{index}"/>'
        for index, name in enumerate(sheet_names, start=1)
    )
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        f'<workbook xmlns="{MAIN_NS}" xmlns:r="{DOC_REL_NS}">'
        '<fileVersion appName="Codex"/>'
        '<workbookPr defaultThemeVersion="124226"/>'
        "<bookViews>"
        '<workbookView xWindow="0" yWindow="0" windowWidth="24000" windowHeight="12000"/>'
        "</bookViews>"
        f"<sheets>{sheets_xml}</sheets>"
        '<calcPr calcId="191029"/>'
        "</workbook>"
    )


def build_workbook_rels_xml(sheet_count: int) -> str:
    worksheet_rels = "".join(
        f'<Relationship Id="rId{index}" Type="{DOC_REL_NS}/worksheet" Target="worksheets/sheet{index}.xml"/>'
        for index in range(1, sheet_count + 1)
    )
    styles_rel = f'<Relationship Id="rId{sheet_count + 1}" Type="{DOC_REL_NS}/styles" Target="styles.xml"/>'
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        f'<Relationships xmlns="{REL_NS}">{worksheet_rels}{styles_rel}</Relationships>'
    )


def build_root_rels_xml() -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        f'<Relationships xmlns="{REL_NS}">'
        f'<Relationship Id="rId1" Type="{DOC_REL_NS}/officeDocument" Target="xl/workbook.xml"/>'
        f'<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>'
        f'<Relationship Id="rId3" Type="{DOC_REL_NS}/extended-properties" Target="docProps/app.xml"/>'
        "</Relationships>"
    )


def build_content_types_xml(sheet_count: int) -> str:
    worksheet_overrides = "".join(
        f'<Override PartName="/xl/worksheets/sheet{index}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        for index in range(1, sheet_count + 1)
    )
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        f"{worksheet_overrides}"
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
        '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
        '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>'
        "</Types>"
    )


def build_styles_xml() -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        f'<styleSheet xmlns="{MAIN_NS}">'
        '<fonts count="2">'
        '<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>'
        '<font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font>'
        "</fonts>"
        '<fills count="3">'
        '<fill><patternFill patternType="none"/></fill>'
        '<fill><patternFill patternType="gray125"/></fill>'
        '<fill><patternFill patternType="solid"><fgColor rgb="FFE2E8F0"/><bgColor indexed="64"/></patternFill></fill>'
        "</fills>"
        '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
        '<cellXfs count="2">'
        '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
        '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>'
        "</cellXfs>"
        '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
        '<dxfs count="0"/>'
        '<tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/>'
        "</styleSheet>"
    )


def build_core_xml(created_at: str) -> str:
    timestamp = xml_text(created_at)
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        f'<cp:coreProperties xmlns:cp="{CORE_NS}" xmlns:dc="{DC_NS}" xmlns:dcterms="{DCTERMS_NS}" xmlns:xsi="{XSI_NS}">'
        "<dc:creator>Codex</dc:creator>"
        "<cp:lastModifiedBy>Codex</cp:lastModifiedBy>"
        f'<dcterms:created xsi:type="dcterms:W3CDTF">{timestamp}</dcterms:created>'
        f'<dcterms:modified xsi:type="dcterms:W3CDTF">{timestamp}</dcterms:modified>'
        "</cp:coreProperties>"
    )


def build_app_xml(sheet_names: list[str]) -> str:
    titles = "".join(f"<vt:lpstr>{xml_text(name)}</vt:lpstr>" for name in sheet_names)
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        f'<Properties xmlns="{APP_NS}" xmlns:vt="{VT_NS}">'
        "<Application>Codex</Application>"
        "<DocSecurity>0</DocSecurity>"
        "<ScaleCrop>false</ScaleCrop>"
        '<HeadingPairs><vt:vector size="2" baseType="variant">'
        "<vt:variant><vt:lpstr>Worksheets</vt:lpstr></vt:variant>"
        f"<vt:variant><vt:i4>{len(sheet_names)}</vt:i4></vt:variant>"
        "</vt:vector></HeadingPairs>"
        f'<TitlesOfParts><vt:vector size="{len(sheet_names)}" baseType="lpstr">{titles}</vt:vector></TitlesOfParts>'
        "<Company></Company>"
        "<LinksUpToDate>false</LinksUpToDate>"
        "<SharedDoc>false</SharedDoc>"
        "<HyperlinksChanged>false</HyperlinksChanged>"
        "<AppVersion>1.0</AppVersion>"
        "</Properties>"
    )


def load_seed(seed_path: Path) -> dict[str, Any]:
    with seed_path.open("r", encoding="utf-8") as handle:
        dataset = json.load(handle)

    sheets = dataset.get("sheets")
    if not isinstance(sheets, list) or not sheets:
        raise ValueError("Seed JSON tidak memiliki array 'sheets' yang valid.")

    for sheet in sheets:
        name = sheet.get("name")
        headers = sheet.get("headers")
        rows = sheet.get("rows")
        if not isinstance(name, str) or not name.strip():
            raise ValueError("Setiap sheet wajib punya nama.")
        if not isinstance(headers, list) or not headers:
            raise ValueError(f"Sheet {name} wajib punya headers.")
        if not isinstance(rows, list):
            raise ValueError(f"Sheet {name} wajib punya rows.")
        for row_index, row in enumerate(rows, start=2):
            if not isinstance(row, list):
                raise ValueError(f"Sheet {name} row {row_index} harus berupa array.")
            if len(row) != len(headers):
                raise ValueError(
                    f"Sheet {name} row {row_index} punya {len(row)} kolom, expected {len(headers)}."
                )

    return dataset


def write_workbook(dataset: dict[str, Any], output_path: Path) -> None:
    sheets = dataset["sheets"]
    sheet_names = [sheet["name"] for sheet in sheets]
    created_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output_path, "w", compression=zipfile.ZIP_DEFLATED) as workbook:
        workbook.writestr("[Content_Types].xml", build_content_types_xml(len(sheets)))
        workbook.writestr("_rels/.rels", build_root_rels_xml())
        workbook.writestr("docProps/core.xml", build_core_xml(created_at))
        workbook.writestr("docProps/app.xml", build_app_xml(sheet_names))
        workbook.writestr("xl/workbook.xml", build_workbook_xml(sheet_names))
        workbook.writestr("xl/_rels/workbook.xml.rels", build_workbook_rels_xml(len(sheets)))
        workbook.writestr("xl/styles.xml", build_styles_xml())

        for index, sheet in enumerate(sheets, start=1):
            workbook.writestr(
                f"xl/worksheets/sheet{index}.xml",
                build_sheet_xml(sheet["name"], sheet["headers"], sheet["rows"]),
            )


def main() -> None:
    args = parse_args()
    dataset = load_seed(args.input.resolve())
    write_workbook(dataset, args.output.resolve())

    print("Workbook generated:")
    print(f"- Input : {args.input.resolve()}")
    print(f"- Output: {args.output.resolve()}")
    for sheet in dataset["sheets"]:
        print(f"- {sheet['name']}: {len(sheet['rows'])} rows")


if __name__ == "__main__":
    main()
