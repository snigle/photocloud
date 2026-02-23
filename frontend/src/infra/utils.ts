import SparkMD5 from 'spark-md5';

const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let result = '';
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const b1 = bytes[i];
    const b2 = i + 1 < len ? bytes[i + 1] : 0;
    const b3 = i + 2 < len ? bytes[i + 2] : 0;

    const c1 = b1 >> 2;
    const c2 = ((b1 & 0x3) << 4) | (b2 >> 4);
    const c3 = ((b2 & 0xf) << 2) | (b3 >> 6);
    const c4 = b3 & 0x3f;

    result += chars.charAt(c1) + chars.charAt(c2);
    result += i + 1 < len ? chars.charAt(c3) : '=';
    result += i + 2 < len ? chars.charAt(c4) : '=';
  }
  return result;
}

export function md5(data: Uint8Array): Uint8Array {
  const hashHex = md5Hex(data);
  const result = new Uint8Array(hashHex.length / 2);
  for (let i = 0; i < hashHex.length; i += 2) {
    result[i / 2] = parseInt(hashHex.substring(i, i + 2), 16);
  }
  return result;
}

export function md5Hex(data: Uint8Array): string {
  const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  return SparkMD5.ArrayBuffer.hash(buffer as any);
}

export function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = base64.replace(/=/g, '');
  const len = binaryString.length;
  const bytes = new Uint8Array(Math.floor((len * 3) / 4));

  let p = 0;
  for (let i = 0; i < len; i += 4) {
    const c1 = chars.indexOf(binaryString.charAt(i));
    const c2 = chars.indexOf(binaryString.charAt(i + 1));
    const c3 = i + 2 < len ? chars.indexOf(binaryString.charAt(i + 2)) : 0;
    const c4 = i + 3 < len ? chars.indexOf(binaryString.charAt(i + 3)) : 0;

    const b1 = (c1 << 2) | (c2 >> 4);
    const b2 = ((c2 & 0xf) << 4) | (c3 >> 2);
    const b3 = ((c3 & 0x3) << 6) | c4;

    bytes[p++] = b1;
    if (i + 2 < len) bytes[p++] = b2;
    if (i + 3 < len) bytes[p++] = b3;
  }
  return bytes;
}

export function encodeText(text: string): Uint8Array {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(text);
  }
  // Fallback for environment without TextEncoder
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    bytes[i] = text.charCodeAt(i) & 0xff;
  }
  return bytes;
}

export function decodeText(bytes: Uint8Array): string {
  if (typeof TextDecoder !== 'undefined') {
    return new TextDecoder().decode(bytes);
  }
  // Fallback for environment without TextDecoder
  let result = '';
  for (let i = 0; i < bytes.length; i++) {
    result += String.fromCharCode(bytes[i]);
  }
  return result;
}
