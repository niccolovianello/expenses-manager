// Minimal ZIP reader: just enough to extract the XML parts of an xlsx file, with no dependencies.
const END_OF_CENTRAL_DIR = 0x06054b50;
const CENTRAL_DIR_ENTRY = 0x02014b50;
const LOCAL_FILE_HEADER = 0x04034b50;
const MAX_COMMENT_LENGTH = 0xffff;

const utf8 = new TextDecoder();

function findEndOfCentralDirectory(view) {
  const lowest = Math.max(0, view.byteLength - 22 - MAX_COMMENT_LENGTH);
  for (let offset = view.byteLength - 22; offset >= lowest; offset--) {
    if (view.getUint32(offset, true) === END_OF_CENTRAL_DIR) return offset;
  }
  throw new Error('Il file non è un archivio xlsx valido');
}

async function inflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Response(stream).text();
}

export function readZip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = findEndOfCentralDirectory(view);
  const entryCount = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true);
  const entries = new Map();

  for (let i = 0; i < entryCount; i++) {
    if (view.getUint32(offset, true) !== CENTRAL_DIR_ENTRY) {
      throw new Error('Archivio xlsx corrotto: directory centrale non leggibile');
    }
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const name = utf8.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    entries.set(name, {
      method: view.getUint16(offset + 10, true),
      compressedSize: view.getUint32(offset + 20, true),
      localOffset: view.getUint32(offset + 42, true),
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }

  return {
    has: (name) => entries.has(name),
    async readText(name) {
      const entry = entries.get(name);
      if (!entry) throw new Error(`Parte "${name}" mancante nel file xlsx`);
      const local = entry.localOffset;
      if (view.getUint32(local, true) !== LOCAL_FILE_HEADER) {
        throw new Error(`Archivio xlsx corrotto: intestazione di "${name}" non valida`);
      }
      const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
      const data = bytes.subarray(start, start + entry.compressedSize);
      if (entry.method === 0) return utf8.decode(data);
      if (entry.method === 8) return inflateRaw(data);
      throw new Error(`Compressione non supportata (${entry.method}) per "${name}"`);
    },
  };
}
