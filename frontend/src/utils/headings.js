/**
 * Citation heading extraction helper for grounded source cards.
 */
export function getHeadingFromCitation(citation) {
  if (
    citation.section_heading &&
    citation.section_heading !== 'General Clause' &&
    citation.section_heading !== 'General Section'
  ) {
    return citation.section_heading;
  }
  if (citation.text_snippet) {
    const lines = citation.text_snippet
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length > 0 && lines[0].length <= 80) {
      return lines[0].replace(/^[#*-]\s*/, '');
    }
  }
  return `Clause Reference ${citation.citation_index || citation.ref_index || '1'}`;
}
