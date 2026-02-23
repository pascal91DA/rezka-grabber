export interface VttCue {
  start: number; // seconds
  end: number;   // seconds
  text: string;
}

function parseTimestamp(ts: string): number {
  // HH:MM:SS.mmm or MM:SS.mmm
  const parts = ts.trim().split(':');
  let h = 0, m = 0, s = 0;
  if (parts.length === 3) {
    h = parseFloat(parts[0]);
    m = parseFloat(parts[1]);
    s = parseFloat(parts[2]);
  } else if (parts.length === 2) {
    m = parseFloat(parts[0]);
    s = parseFloat(parts[1]);
  }
  return h * 3600 + m * 60 + s;
}

export function parseVtt(text: string): VttCue[] {
  const cues: VttCue[] = [];
  // Split on blank lines
  const blocks = text.replace(/\r\n/g, '\n').split(/\n\s*\n/);

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    // Find the timing line: "HH:MM:SS.mmm --> HH:MM:SS.mmm"
    let timingIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('-->')) {
        timingIdx = i;
        break;
      }
    }
    if (timingIdx === -1) continue;

    const timingParts = lines[timingIdx].split('-->');
    if (timingParts.length < 2) continue;

    const start = parseTimestamp(timingParts[0]);
    // Strip positioning tags after the end timestamp (e.g. "00:01.000 line:10%")
    const endRaw = timingParts[1].trim().split(/\s/)[0];
    const end = parseTimestamp(endRaw);

    const textLines = lines.slice(timingIdx + 1);
    // Strip HTML tags (<i>, <b>, <c>, etc.) and cue IDs
    const text = textLines
      .join('\n')
      .replace(/<[^>]+>/g, '')
      .trim();

    if (text) {
      cues.push({start, end, text});
    }
  }

  return cues;
}

export function getCurrentCue(cues: VttCue[], currentTime: number): string | null {
  for (const cue of cues) {
    if (currentTime >= cue.start && currentTime <= cue.end) {
      return cue.text;
    }
  }
  return null;
}
