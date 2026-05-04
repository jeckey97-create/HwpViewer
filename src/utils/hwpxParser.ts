import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import RNFS from 'react-native-fs';

export interface ParsedDocument {
  title: string;
  html: string;
  pageCount: number;
}

function getText(node: any): string {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(getText).join('');
  if (typeof node === 'object') {
    if (node['#text'] !== undefined) return String(node['#text']);
    let result = '';
    if (node['hp:t'] !== undefined) result += getText(node['hp:t']);
    if (node['hp:run']) {
      const runs = Array.isArray(node['hp:run'])
        ? node['hp:run']
        : [node['hp:run']];
      result += runs.map((r: any) => getText(r)).join('');
    }
    return result;
  }
  return '';
}

function extractCellText(tc: any): string {
  if (!tc) return '';
  const sublist = tc['hp:subList'];
  if (!sublist) return '';
  const paras = Array.isArray(sublist['hp:p'])
    ? sublist['hp:p']
    : sublist['hp:p']
    ? [sublist['hp:p']]
    : [];

  const parts = paras
    .map((p: any) => {
      const runs = Array.isArray(p['hp:run'])
        ? p['hp:run']
        : p['hp:run']
        ? [p['hp:run']]
        : [];
      const raw = runs.map((r: any) => getText(r)).join('');
      if (!raw) return '';
      const text = raw
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      let align = 'left';
      try {
        const parapr = p['hp:parapr'] || p['hp:paraPr'] || {};
        const just = parapr['hp:justification'];
        if (just) {
          const t = just['@_type'] || '';
          if (t === 'CENTER' || t === 'center') align = 'center';
          else if (t === 'RIGHT' || t === 'right') align = 'right';
          else if (t === 'DISTRIBUTE' || t === 'BOTH') align = 'justify';
        }
      } catch {}

      return `<div style="text-align:${align};">${text}</div>`;
    })
    .filter(Boolean);

  return parts.join('');
}

function tableToHtml(tbl: any): string {
  if (!tbl) return '';
  const trs = tbl['hp:tr']
    ? Array.isArray(tbl['hp:tr'])
      ? tbl['hp:tr']
      : [tbl['hp:tr']]
    : [];

  // 첫 번째 행의 hp:cellSz @_w 합산으로 전체 표 너비 계산
  let totalWidth = 0;
  if (trs.length > 0) {
    const firstTcs = trs[0]['hp:tc']
      ? Array.isArray(trs[0]['hp:tc'])
        ? trs[0]['hp:tc']
        : [trs[0]['hp:tc']]
      : [];
    for (const tc of firstTcs) {
      totalWidth += Number(tc['hp:cellSz']?.['@_width'] || 0);
    }
  }

  let html =
    '<table border="1" cellspacing="0" cellpadding="6" style="border-collapse:collapse;width:100%;margin:10px 0;font-size:14px;">';
  for (const tr of trs) {
    html += '<tr>';
    const tcs = tr['hp:tc']
      ? Array.isArray(tr['hp:tc'])
        ? tr['hp:tc']
        : [tr['hp:tc']]
      : [];
    for (const tc of tcs) {
      const cellSpan = tc['hp:cellSpan'] || {};
      const colspan = cellSpan['@_colSpan'] ? Number(cellSpan['@_colSpan']) : 1;
      const rowspan = cellSpan['@_rowSpan'] ? Number(cellSpan['@_rowSpan']) : 1;
      const cellWidth = Number(tc['hp:cellSz']?.['@_width'] || 0);
      const text = extractCellText(tc);
      const colAttr = colspan > 1 ? ` colspan="${colspan}"` : '';
      const rowAttr = rowspan > 1 ? ` rowspan="${rowspan}"` : '';
      const widthAttr =
        totalWidth > 0 && cellWidth > 0
          ? ` width="${((cellWidth / totalWidth) * 100).toFixed(2)}%"`
          : '';
      html += `<td${colAttr}${rowAttr}${widthAttr} style="vertical-align:middle;padding:6px 8px;">${text}</td>`;
    }
    html += '</tr>';
  }
  html += '</table>';
  return html;
}

function paraToHtml(para: any): string {
  if (!para || typeof para !== 'object') return '';

  const runs = para['hp:run']
    ? Array.isArray(para['hp:run'])
      ? para['hp:run']
      : [para['hp:run']]
    : [];

  // 표 처리
  for (const run of runs) {
    if (run['hp:tbl']) {
      return tableToHtml(run['hp:tbl']);
    }
  }

  // 텍스트 처리
  const text = runs
    .map((r: any) => getText(r))
    .join('')
    .trim();
  if (!text) return '<p style="margin:4px 0;height:12px;"></p>';

  // 정렬
  let align = 'left';
  try {
    const parapr = para['hp:parapr'] || para['hp:paraPr'] || {};
    const justification = parapr['hp:justification'];
    if (justification) {
      const t = justification['@_type'] || '';
      if (t === 'CENTER' || t === 'center') align = 'center';
      else if (t === 'RIGHT' || t === 'right') align = 'right';
      else if (t === 'DISTRIBUTE' || t === 'BOTH') align = 'justify';
    }
  } catch {}

  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return `<p style="margin:4px 0;line-height:1.8;text-align:${align};">${escaped}</p>`;
}

export async function parseHwpx(fileUri: string): Promise<ParsedDocument> {
  let base64Data: string;
  try {
    base64Data = await RNFS.readFile(fileUri, 'base64');
  } catch (e) {
    throw new Error(`파일을 읽을 수 없습니다: ${e}`);
  }

  const binaryStr = atob(base64Data);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes.buffer);
  } catch {
    throw new Error('ZIP 파일 파싱 실패.');
  }

  const fileNames = Object.keys(zip.files);
  const sectionFiles = fileNames
    .filter(f => f.startsWith('Contents/section') && f.endsWith('.xml'))
    .sort();

  if (sectionFiles.length === 0)
    throw new Error('문서 내용을 찾을 수 없습니다.');

  const xmlParser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    parseTagValue: false,
    isArray: tagName => ['hp:p', 'hp:run', 'hp:tr', 'hp:tc'].includes(tagName),
  });

  let bodyHtml = '';

  for (const sectionFile of sectionFiles) {
    const sectionXmlFile = zip.file(sectionFile);
    if (!sectionXmlFile) continue;
    let xmlContent: string;
    try {
      xmlContent = await sectionXmlFile.async('string');
    } catch {
      continue;
    }
    let parsed: any;
    try {
      parsed = xmlParser.parse(xmlContent);
    } catch {
      continue;
    }

    const sec = parsed?.['hs:sec'] || parsed?.sec || parsed;
    let rawParas = sec?.['hp:p'];
    if (!rawParas) rawParas = findParas(sec);
    if (!rawParas) continue;

    const paraArr = Array.isArray(rawParas) ? rawParas : [rawParas];
    for (const para of paraArr) {
      bodyHtml += paraToHtml(para);
    }
  }

  const uriParts = fileUri.split('/');
  const fileName = decodeURIComponent(uriParts[uriParts.length - 1] || '문서');
  const title = fileName.replace(/\.hwpx?$/i, '');

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<style>
  body { font-family: 'Malgun Gothic', sans-serif; font-size: 14px; color: #1a1a1a; padding: 16px; margin: 0; background: #fff; }
  table { border-collapse: collapse; width: 100%; margin: 10px 0; }
  td, th { border: 1px solid #999; padding: 6px 8px; vertical-align: middle; font-size: 13px; }
  p { margin: 4px 0; line-height: 1.8; }
</style>
</head>
<body>${bodyHtml}</body>
</html>`;

  return { title, html, pageCount: sectionFiles.length };
}

function findParas(node: any): any[] | null {
  if (!node || typeof node !== 'object') return null;
  for (const key of Object.keys(node)) {
    if (key === 'hp:p')
      return Array.isArray(node[key]) ? node[key] : [node[key]];
    if (typeof node[key] === 'object' && !Array.isArray(node[key])) {
      const found = findParas(node[key]);
      if (found) return found;
    }
  }
  return null;
}

export async function parseFile(fileUri: string): Promise<ParsedDocument> {
  const lower = fileUri.toLowerCase();
  if (lower.includes('.hwpx') || lower.endsWith('hwpx'))
    return parseHwpx(fileUri);
  return {
    title: '미지원 형식',
    html: '<p style="text-align:center;color:#888;">.hwp 파일은 현재 지원되지 않습니다.<br/>.hwpx 파일을 사용해 주세요.</p>',
    pageCount: 1,
  };
}
