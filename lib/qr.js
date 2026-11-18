// Zero-dependency ISO/IEC 18004 QR Code matrix generator (Byte mode, ECC Level L, Versions 1..10).
// Renders crisp inline SVG QR codes for Google Authenticator otpauth:// URIs without external network calls.

// Total codewords and ECC codewords per block for Level L, Versions 1..10
const VERSION_INFO_L = [
  null,
  { total: 26, ecPerBlock: 7, blocks1: 1, data1: 19, blocks2: 0, data2: 0, align: [] },
  { total: 44, ecPerBlock: 10, blocks1: 1, data1: 34, blocks2: 0, data2: 0, align: [6, 18] },
  { total: 70, ecPerBlock: 15, blocks1: 1, data1: 55, blocks2: 0, data2: 0, align: [6, 22] },
  { total: 100, ecPerBlock: 20, blocks1: 1, data1: 80, blocks2: 0, data2: 0, align: [6, 26] },
  { total: 134, ecPerBlock: 26, blocks1: 1, data1: 108, blocks2: 0, data2: 0, align: [6, 30] },
  { total: 172, ecPerBlock: 18, blocks1: 2, data1: 68, blocks2: 0, data2: 0, align: [6, 34] },
  { total: 196, ecPerBlock: 20, blocks1: 2, data1: 78, blocks2: 0, data2: 0, align: [6, 22, 38] },
  { total: 242, ecPerBlock: 24, blocks1: 2, data1: 97, blocks2: 0, data2: 0, align: [6, 24, 42] },
  { total: 292, ecPerBlock: 30, blocks1: 2, data1: 116, blocks2: 0, data2: 0, align: [6, 26, 46] },
  { total: 346, ecPerBlock: 18, blocks1: 2, data1: 68, blocks2: 2, data2: 69, align: [6, 28, 50] },
];

// Precomputed 15-bit Format Information strings for ECC Level L (01), Masks 0..7
const FORMAT_BITS_L = [
  0x77c4, 0x72f3, 0x7daa, 0x789d, 0x662f, 0x6318, 0x6c41, 0x6976,
];

// Version info bits for versions 7..10
const VERSION_BITS = {
  7: 0x07c94,
  8: 0x085bc,
  9: 0x09a99,
  10: 0x0a4d3,
};

// GF(256) tables with primitive polynomial 0x11d
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();

function gfMul(a, b) {
  return a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]];
}

function rsGeneratorPoly(degree) {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(poly.length + 1);
    const root = EXP[i];
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], root);
    }
    poly = next;
  }
  return poly;
}

function rsEncode(data, ecLen) {
  const gen = rsGeneratorPoly(ecLen);
  const rem = new Uint8Array(ecLen);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ rem[0];
    rem.copyWithin(0, 1);
    rem[ecLen - 1] = 0;
    for (let j = 0; j < ecLen; j++) {
      rem[j] ^= gfMul(gen[j + 1], factor);
    }
  }
  return rem;
}

export function encodeQrMatrix(text) {
  const utf8 = new TextEncoder().encode(text);
  let ver = 1;
  while (ver <= 10) {
    const info = VERSION_INFO_L[ver];
    const dataCap = info.blocks1 * info.data1 + info.blocks2 * info.data2;
    const headerBytes = ver < 10 ? 2 : 3;
    if (utf8.length + headerBytes <= dataCap) break;
    ver++;
  }
  if (ver > 10) throw new Error("QR payload too long");

  const info = VERSION_INFO_L[ver];
  const dataCap = info.blocks1 * info.data1 + info.blocks2 * info.data2;

  // Build bit buffer: 4-bit mode (0100 = byte), 8 or 16-bit char count, payload bytes, terminator, pad bytes
  const bits = [];
  const pushBits = (val, len) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1);
  };
  pushBits(0b0100, 4);
  pushBits(utf8.length, ver < 10 ? 8 : 16);
  for (const b of utf8) pushBits(b, 8);
  const maxBits = dataCap * 8;
  pushBits(0, Math.min(4, maxBits - bits.length));
  while (bits.length % 8 !== 0) bits.push(0);

  const dataBytes = new Uint8Array(dataCap);
  for (let i = 0; i < bits.length / 8; i++) {
    let byte = 0;
    for (let b = 0; b < 8; b++) byte = (byte << 1) | bits[i * 8 + b];
    dataBytes[i] = byte;
  }
  const pads = [0xec, 0x11];
  for (let i = bits.length / 8, p = 0; i < dataCap; i++, p++) {
    dataBytes[i] = pads[p & 1];
  }

  // Split into blocks and compute RS ECC
  const dataBlocks = [];
  const ecBlocks = [];
  let offset = 0;
  for (let i = 0; i < info.blocks1; i++) {
    const blk = dataBytes.slice(offset, offset + info.data1);
    offset += info.data1;
    dataBlocks.push(blk);
    ecBlocks.push(rsEncode(blk, info.ecPerBlock));
  }
  for (let i = 0; i < info.blocks2; i++) {
    const blk = dataBytes.slice(offset, offset + info.data2);
    offset += info.data2;
    dataBlocks.push(blk);
    ecBlocks.push(rsEncode(blk, info.ecPerBlock));
  }

  // Interleave data and EC codewords
  const codewords = [];
  const maxDataLen = Math.max(info.data1, info.data2);
  for (let i = 0; i < maxDataLen; i++) {
    for (const blk of dataBlocks) if (i < blk.length) codewords.push(blk[i]);
  }
  for (let i = 0; i < info.ecPerBlock; i++) {
    for (const blk of ecBlocks) codewords.push(blk[i]);
  }

  // Create matrix
  const size = ver * 4 + 17;
  const mod = Array.from({ length: size }, () => new Uint8Array(size));
  const isFunc = Array.from({ length: size }, () => new Uint8Array(size));

  const setFunction = (r, c, val) => {
    mod[r][c] = val ? 1 : 0;
    isFunc[r][c] = 1;
  };

  // Finder patterns + separators
  const drawFinder = (r0, c0) => {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const r = r0 + dr, c = c0 + dc;
        if (r < 0 || r >= size || c < 0 || c >= size) continue;
        const on =
          (dr >= 0 && dr <= 6 && (dc === 0 || dc === 6)) ||
          (dc >= 0 && dc <= 6 && (dr === 0 || dr === 6)) ||
          (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4);
        setFunction(r, c, on);
      }
    }
  };
  drawFinder(0, 0);
  drawFinder(0, size - 7);
  drawFinder(size - 7, 0);

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    setFunction(6, i, i % 2 === 0);
    setFunction(i, 6, i % 2 === 0);
  }

  // Alignment patterns
  const align = info.align;
  for (let i = 0; i < align.length; i++) {
    for (let j = 0; j < align.length; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === align.length - 1) || (i === align.length - 1 && j === 0)) continue;
      const r0 = align[i], c0 = align[j];
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const on = Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
          setFunction(r0 + dr, c0 + dc, on);
        }
      }
    }
  }

  // Dark module and reserve format info areas
  setFunction(size - 8, 8, true);
  for (let i = 0; i < 9; i++) {
    if (!isFunc[8][i]) setFunction(8, i, false);
    if (!isFunc[i][8]) setFunction(i, 8, false);
  }
  for (let i = 0; i < 8; i++) {
    if (!isFunc[8][size - 1 - i]) setFunction(8, size - 1 - i, false);
    if (!isFunc[size - 1 - i][8]) setFunction(size - 1 - i, 8, false);
  }

  // Version info (for ver >= 7)
  if (ver >= 7 && VERSION_BITS[ver]) {
    const vbits = VERSION_BITS[ver];
    for (let i = 0; i < 18; i++) {
      const bit = ((vbits >>> i) & 1) === 1;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      setFunction(b, a, bit);
      setFunction(a, b, bit);
    }
  }

  // Place data bits in zigzag upward/downward 2-column strips
  let bitIdx = 0;
  const totalBits = codewords.length * 8;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    const upward = ((right + 1) & 2) === 0;
    for (let vert = 0; vert < size; vert++) {
      const r = upward ? size - 1 - vert : vert;
      for (let j = 0; j < 2; j++) {
        const c = right - j;
        if (isFunc[r][c]) continue;
        let bit = 0;
        if (bitIdx < totalBits) {
          bit = (codewords[bitIdx >>> 3] >>> (7 - (bitIdx & 7))) & 1;
          bitIdx++;
        }
        // Apply mask 0: (r + c) % 2 === 0
        if ((r + c) % 2 === 0) bit ^= 1;
        mod[r][c] = bit;
      }
    }
  }

  // Write format info for Mask 0
  const fmt = FORMAT_BITS_L[0];
  for (let i = 0; i <= 5; i++) setFunction(8, i, ((fmt >>> i) & 1) === 1);
  setFunction(8, 7, ((fmt >>> 6) & 1) === 1);
  setFunction(8, 8, ((fmt >>> 7) & 1) === 1);
  setFunction(7, 8, ((fmt >>> 8) & 1) === 1);
  for (let i = 9; i < 15; i++) setFunction(14 - i, 8, ((fmt >>> i) & 1) === 1);
  for (let i = 0; i < 8; i++) setFunction(size - 1 - i, 8, ((fmt >>> i) & 1) === 1);
  for (let i = 8; i < 15; i++) setFunction(8, size - 15 + i, ((fmt >>> i) & 1) === 1);

  return mod;
}

