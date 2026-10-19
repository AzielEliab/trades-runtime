/**
 * Minimal, dependency-free XML reader for read-only vendor pulls (Kickserv).
 *
 * Scope is deliberately small: elements, attributes, text, CDATA, comments,
 * processing instructions, the five predefined entities, and numeric
 * character references. DOCTYPE and ENTITY declarations are refused outright,
 * so there is no external-entity fetch and no entity expansion. Input is
 * capped in size and nesting depth.
 *
 * Rails-style hints are honored the way Rails `to_xml` writes them:
 * type="array" makes a list, nil="true" is null, type="integer" /
 * "decimal" / "float" / "boolean" are coerced. Elements without children
 * become their text. Repeated sibling names become a list.
 */

export const XML_MAX_BYTES = 10 * 1024 * 1024;
const MAX_DEPTH = 64;

export type XmlValue = string | number | boolean | null | XmlValue[] | { [key: string]: XmlValue };

interface XmlNode {
  name: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  text: string;
}

const NAMED: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (match, body: string) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    const named = NAMED[body];
    if (named === undefined) throw new Error(`XML: undefined entity &${body};`);
    return named;
  });
}

const NAME = /^[A-Za-z_][\w.:-]*/;

function parseNodes(xml: string): XmlNode {
  if (xml.length > XML_MAX_BYTES) throw new Error("XML: response too large");
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("XML: DOCTYPE/ENTITY declarations are refused");
  const root: XmlNode = { name: "#document", attrs: {}, children: [], text: "" };
  const stack: XmlNode[] = [root];
  let i = 0;
  while (i < xml.length) {
    const lt = xml.indexOf("<", i);
    const top = stack[stack.length - 1]!;
    if (lt === -1) {
      top.text += decodeEntities(xml.slice(i));
      break;
    }
    if (lt > i) top.text += decodeEntities(xml.slice(i, lt));
    if (xml.startsWith("<!--", lt)) {
      const end = xml.indexOf("-->", lt + 4);
      if (end === -1) throw new Error("XML: unterminated comment");
      i = end + 3;
      continue;
    }
    if (xml.startsWith("<![CDATA[", lt)) {
      const end = xml.indexOf("]]>", lt + 9);
      if (end === -1) throw new Error("XML: unterminated CDATA");
      top.text += xml.slice(lt + 9, end);
      i = end + 3;
      continue;
    }
    if (xml.startsWith("<?", lt)) {
      const end = xml.indexOf("?>", lt + 2);
      if (end === -1) throw new Error("XML: unterminated processing instruction");
      i = end + 2;
      continue;
    }
    if (xml.startsWith("<!", lt)) throw new Error("XML: unsupported declaration");
    const gt = xml.indexOf(">", lt + 1);
    if (gt === -1) throw new Error("XML: unterminated tag");
    const inner = xml.slice(lt + 1, gt);
    if (inner.startsWith("/")) {
      const name = inner.slice(1).trim();
      if (stack.length < 2 || top.name !== name) throw new Error(`XML: mismatched closing tag </${name}>`);
      stack.pop();
      i = gt + 1;
      continue;
    }
    const selfClosing = inner.endsWith("/");
    const body = selfClosing ? inner.slice(0, -1) : inner;
    const nameMatch = NAME.exec(body);
    if (!nameMatch) throw new Error("XML: bad tag name");
    const node: XmlNode = { name: nameMatch[0], attrs: {}, children: [], text: "" };
    const attrPattern = /([A-Za-z_][\w.:-]*)\s*=\s*("([^"]*)"|'([^']*)')/g;
    const rest = body.slice(nameMatch[0].length);
    let attr: RegExpExecArray | null;
    while ((attr = attrPattern.exec(rest))) node.attrs[attr[1]!] = decodeEntities(attr[3] ?? attr[4] ?? "");
    top.children.push(node);
    if (!selfClosing) {
      if (stack.length > MAX_DEPTH) throw new Error("XML: nesting too deep");
      stack.push(node);
    }
    i = gt + 1;
  }
  if (stack.length !== 1) throw new Error(`XML: unclosed element <${stack[stack.length - 1]!.name}>`);
  if (root.children.length !== 1) throw new Error("XML: expected exactly one root element");
  return root.children[0]!;
}

function scalar(node: XmlNode): XmlValue {
  if (node.attrs.nil === "true") return null;
  const text = node.text.trim();
  switch (node.attrs.type) {
    case "integer":
    case "decimal":
    case "float": {
      if (!text) return null;
      const number = Number(text);
      return Number.isFinite(number) ? number : text;
    }
    case "boolean":
      return text === "true" ? true : text === "false" ? false : text;
    default:
      return text;
  }
}

function toValue(node: XmlNode): XmlValue {
  if (node.attrs.type === "array") return node.children.map(toValue);
  if (!node.children.length) return scalar(node);
  const grouped = new Map<string, XmlValue[]>();
  for (const child of node.children) {
    const list = grouped.get(child.name) ?? [];
    list.push(toValue(child));
    grouped.set(child.name, list);
  }
  const out: { [key: string]: XmlValue } = {};
  for (const [name, list] of grouped) out[name] = list.length === 1 ? list[0]! : list;
  return out;
}

/** Parses an XML document into `{ <rootName>: value }`. Throws on malformed or unsafe input. */
export function parseXml(xml: string): { [key: string]: XmlValue } {
  const root = parseNodes(xml.replace(/^\uFEFF/, ""));
  return { [root.name]: toValue(root) };
}

/**
 * Rows of a collection element: `<jobs type="array"><job/>…</jobs>` is already a
 * list; `<jobs><job/>…</jobs>` (no type hint) unwraps its single repeated child,
 * and a lone `<job>` becomes a one-row list.
 */
export function xmlCollectionRows(value: unknown): Record<string, unknown>[] {
  const isObj = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v);
  if (Array.isArray(value)) return value.filter(isObj);
  if (isObj(value)) {
    const keys = Object.keys(value);
    if (keys.length === 1) {
      const only = value[keys[0]!];
      if (Array.isArray(only)) return only.filter(isObj);
      if (isObj(only)) return [only];
    }
  }
  return [];
}
