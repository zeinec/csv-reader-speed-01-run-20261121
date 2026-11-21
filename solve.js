// Fast drop-in for csv-reader 1.0.0 (make.fun's own CSV reader).
// run(input) returns exactly csv-reader's {columns, rows, errors} for every
// {text, header} input. Single pass, no per-character loop on hot paths:
//   - quote-free records go through one slice + split(',');
//   - unquoted fields are bounded by a single native regex scan for the
//     next delimiter (',', LF or CR) — never an unbounded indexOf('\r'),
//     which in LF files would scan thousands of characters to the next CR;
//   - quoted fields find their close with native indexOf('"'), skipping
//     doubled quotes, and slice the interior (bulk CR/LF + '""' handling
//     only when the interior actually holds them);
//   - no per-field return arrays: field results travel in closure slots.
// Dependency-free ES module. Pure: nothing kept between calls.

const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

/** csv-reader 1.0.0's answer for one case's input. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const n = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = 0;
  let line = 1;
  if (n > 0 && text.charCodeAt(0) === 0xfeff) pos = 1;

  let recordLine = 1;
  let recordRow = null;

  // Field result slots (readUnquoted / readQuoted write these, no arrays).
  let fVal = '';
  let fEnd = 0;
  let fAdd = 0;

  function pushErr(code) {
    errors.push({ code, line: recordLine, row: recordRow });
  }

  // One native scan finds the next field delimiter of any kind. test()
  // with /g advances lastIndex past the one-character match, so the match
  // index is lastIndex - 1 and no match array is ever allocated.
  const delim = /[,\n\r]/g;

  // Reads an unquoted field starting at pos, appending the kept characters
  // to `init`. Sets fVal / fEnd / fAdd; fAdd counts the characters kept by
  // this call (the quote_junk test uses it, never the initial value).
  // A CR not followed by LF is dropped with a stray_cr error.
  function readUnquoted(init) {
    let value = init;
    let added = 0;
    for (;;) {
      delim.lastIndex = pos;
      if (!delim.test(text)) {
        // No delimiter left. No LF is left either, so every CR in the
        // rest is stray.
        const seg = text.slice(pos);
        if (seg.indexOf('\r') === -1) {
          fVal = value + seg;
          fAdd = added + seg.length;
          pos = n;
          fEnd = END;
          return;
        }
        const parts = seg.split('\r');
        for (let k = 1; k < parts.length; k++) pushErr('stray_cr');
        fVal = value + parts.join('');
        fAdd = added + seg.length - (parts.length - 1);
        pos = n;
        fEnd = END;
        return;
      }
      const d = delim.lastIndex - 1;
      const kind = text.charCodeAt(d);
      if (kind === 44) {
        if (d > pos) {
          value += text.slice(pos, d);
          added += d - pos;
        }
        pos = d + 1;
        fVal = value;
        fAdd = added;
        fEnd = COMMA;
        return;
      }
      if (kind === 10) {
        if (d > pos) {
          value += text.slice(pos, d);
          added += d - pos;
        }
        pos = d + 1;
        line += 1;
        fVal = value;
        fAdd = added;
        fEnd = LINE_BREAK;
        return;
      }
      // CR: CRLF ends the field as a line break, a lone CR is dropped
      // and the field goes on.
      if (text.charCodeAt(d + 1) === 10) {
        if (d > pos) {
          value += text.slice(pos, d);
          added += d - pos;
        }
        pos = d + 2;
        line += 1;
        fVal = value;
        fAdd = added;
        fEnd = LINE_BREAK;
        return;
      }
      pushErr('stray_cr');
      if (d > pos) {
        value += text.slice(pos, d);
        added += d - pos;
      }
      pos = d + 1;
    }
  }

  // Reads a quoted field whose opening quote is at pos.
  // Sets fVal / fEnd / fAdd (fAdd is 0 except on the junk path, which
  // carries readUnquoted's own count).
  function readQuoted() {
    const open = pos;
    const openLine = line;
    pos += 1;
    let doubled = false;
    let close = -1;
    let from = pos;
    for (;;) {
      const q = text.indexOf('"', from);
      if (q === -1) break;
      if (text.charCodeAt(q + 1) === 34) {
        doubled = true;
        from = q + 2;
        continue;
      }
      close = q;
      break;
    }
    if (close === -1) {
      // The quote never closes: it is a literal character, and the text
      // after it is read again as unquoted. `line` never moved, so it is
      // still the opening line, exactly as the reference resets it.
      pos = open + 1;
      line = openLine;
      pushErr('unterminated_quote');
      readUnquoted('"');
      return;
    }
    const inner = text.slice(open + 1, close);
    let value;
    if (inner.indexOf('\n') === -1 && inner.indexOf('\r') === -1) {
      value = doubled ? inner.replaceAll('""', '"') : inner;
    } else {
      // Rare (a multi-line note): fold each CRLF or lone CR to one LF and
      // each doubled quote to one quote, with native replaces; the line
      // count is the number of LFs in the folded value (every break is
      // exactly one LF there).
      let v = doubled ? inner.replaceAll('""', '"') : inner;
      if (v.indexOf('\r') !== -1) v = v.replace(/\r\n?/g, '\n');
      let breaks = 0;
      let idx = -1;
      while ((idx = v.indexOf('\n', idx + 1)) !== -1) breaks++;
      line += breaks;
      value = v;
    }
    pos = close + 1;
    if (pos >= n) {
      fVal = value;
      fEnd = END;
      fAdd = 0;
      return;
    }
    const c = text.charCodeAt(pos);
    if (c === 44) {
      pos += 1;
      fVal = value;
      fEnd = COMMA;
      fAdd = 0;
      return;
    }
    if (c === 10) {
      pos += 1;
      line += 1;
      fVal = value;
      fEnd = LINE_BREAK;
      fAdd = 0;
      return;
    }
    if (c === 13 && text.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line += 1;
      fVal = value;
      fEnd = LINE_BREAK;
      fAdd = 0;
      return;
    }
    // What follows the closing quote is appended as it stands, up to the
    // next comma or line break; quote_junk only when something was kept,
    // and only after the junk's own stray_cr errors.
    readUnquoted(value);
    if (fAdd > 0) pushErr('quote_junk');
  }

  // Reads one record field by field (the general path: the record holds a
  // quote, or a stray CR). Returns [fields, ended, lastQuoted].
  function readRecordGeneral() {
    const fields = [];
    let lastQuoted = false;
    let ended;
    for (;;) {
      if (text.charCodeAt(pos) === 34) {
        readQuoted();
        lastQuoted = true;
      } else {
        readUnquoted('');
        lastQuoted = false;
      }
      fields.push(fVal);
      ended = fEnd;
      if (ended !== COMMA) break;
    }
    return [fields, ended, lastQuoted];
  }

  while (true) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;

    const lf = text.indexOf('\n', pos);
    const recEnd = lf === -1 ? n : lf;
    const q = text.indexOf('"', pos);

    let fields;
    let ended;
    let quoted = false;

    if (q === -1 || q >= recEnd) {
      // Quote-free record: slice it once, check the slice for a CR, split.
      const rec = text.slice(pos, recEnd);
      const rPos = rec.indexOf('\r');
      if (rPos === -1) {
        fields = rec.split(',');
        if (lf === -1) {
          pos = n;
          ended = END;
        } else {
          pos = lf + 1;
          line += 1;
          ended = LINE_BREAK;
        }
      } else if (rPos === rec.length - 1) {
        if (lf === -1) {
          // A lone CR at the end of the text: dropped, with an error.
          pushErr('stray_cr');
          fields = rec.slice(0, -1).split(',');
          pos = n;
          ended = END;
        } else {
          // The only CR is the CRLF's: strip it with the line break.
          fields = rec.slice(0, -1).split(',');
          pos = lf + 1;
          line += 1;
          ended = LINE_BREAK;
        }
      } else {
        // A stray CR inside the record: the general path handles it.
        const g = readRecordGeneral();
        fields = g[0];
        ended = g[1];
        quoted = g[2];
      }
    } else {
      const g = readRecordGeneral();
      fields = g[0];
      ended = g[1];
      quoted = g[2];
    }

    // A line that held only stray CRs is left with no characters: no
    // record (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !quoted) {
      if (ended === END) break;
      continue;
    }

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
    } else {
      if (fields.length < width) {
        errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
        while (fields.length < width) fields.push('');
      } else if (fields.length > width) {
        errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.slice(width) });
        fields.length = width;
      }
      rows.push(fields);
    }
    if (ended === END) break;
  }

  return { columns: header ? (columns ?? []) : null, rows, errors };
}
