import { readZip } from './zip.js';

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

export function decodeXml(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (match, entity) => {
    if (entity[0] !== '#') return ENTITIES[entity] ?? match;
    const hex = entity[1].toLowerCase() === 'x';
    return String.fromCodePoint(parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10));
  });
}

function parseAttributes(source) {
  const attributes = {};
  for (const [, name, value] of source.matchAll(/([\w:]+)="([^"]*)"/g)) attributes[name] = decodeXml(value);
  return attributes;
}

// Testo di un nodo <si> o <is>: concatena i run <t>, escluse le annotazioni fonetiche.
function textContent(xml) {
  const withoutPhonetic = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
  return [...withoutPhonetic.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => decodeXml(m[1])).join('');
}

async function readSharedStrings(zip) {
  if (!zip.has('xl/sharedStrings.xml')) return [];
  const xml = await zip.readText('xl/sharedStrings.xml');
  return [...xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((m) => textContent(m[1]));
}

function columnIndex(reference) {
  const letters = reference.replace(/\d+$/, '');
  let index = 0;
  for (const char of letters) index = index * 26 + (char.charCodeAt(0) - 64);
  return index - 1;
}

function cellValue(attributes, inner, sharedStrings) {
  const raw = inner.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1];
  switch (attributes.t) {
    case 's': return raw === undefined ? null : sharedStrings[Number(raw)] ?? null;
    case 'inlineStr': return textContent(inner);
    case 'b': return raw === '1';
    case 'str':
    case 'e': return raw === undefined ? null : decodeXml(raw);
    default: {
      if (raw === undefined || raw === '') return null;
      const number = Number(raw);
      return Number.isFinite(number) ? number : decodeXml(raw);
    }
  }
}

function parseSheet(xml, sharedStrings) {
  const rows = [];
  for (const [, rowXml] of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row = [];
    for (const [, attrSource, inner = ''] of rowXml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attributes = parseAttributes(attrSource);
      if (!attributes.r) continue;
      row[columnIndex(attributes.r)] = cellValue(attributes, inner, sharedStrings);
    }
    rows.push(Array.from(row, (value) => value ?? null));
  }
  return rows;
}

const resolveTarget = (target) => (target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`);

async function resolveSheetPaths(zip) {
  const relsXml = await zip.readText('xl/_rels/workbook.xml.rels');
  const targets = new Map();
  for (const [, source] of relsXml.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const { Id, Target } = parseAttributes(source);
    if (Id && Target) targets.set(Id, resolveTarget(Target));
  }
  const workbookXml = await zip.readText('xl/workbook.xml');
  return [...workbookXml.matchAll(/<sheet\b([^>]*)\/?>/g)].map(([, source]) => {
    const attributes = parseAttributes(source);
    return { name: attributes.name, path: targets.get(attributes['r:id']) };
  });
}

export async function readWorkbook(bytes) {
  const zip = readZip(bytes);
  const sharedStrings = await readSharedStrings(zip);
  const sheetPaths = (await resolveSheetPaths(zip)).filter((sheet) => sheet.path && zip.has(sheet.path));
  const sheets = await Promise.all(sheetPaths.map(async (sheet) => ({
    name: sheet.name,
    rows: parseSheet(await zip.readText(sheet.path), sharedStrings),
  })));
  return { sheets };
}
