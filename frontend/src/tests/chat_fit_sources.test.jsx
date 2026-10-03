import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import GroundedSourceCard from '../components/workspace/GroundedSourceCard';
import SynthesisView from '../components/workspace/SynthesisView';

describe('Chat-Fit Layout & Grounded Source Cards', () => {
  it('renders GroundedSourceCard with location, document title, page number, and section heading', () => {
    const mockCitation = {
      citation_index: 1,
      page_number: 4,
      confidence: 0.95,
      status: 'VERIFIED',
      section_heading: 'SECTION 14: INDEMNIFICATION & LIABILITY',
      text_snippet: 'The total aggregate liability under this Agreement shall not exceed twelve months fees.',
      document_title: 'Apple_MSA_2026.pdf',
    };

    const onSelectSpy = vi.fn();
    const onInspectSpy = vi.fn();

    render(
      <GroundedSourceCard
        citation={mockCitation}
        documentInfo={{ label: 'Doc A', title: 'Apple_MSA_2026.pdf' }}
        onSelectCitation={onSelectSpy}
        onInspectPdf={onInspectSpy}
      />
    );

    // Verify elements
    expect(screen.getByText(/Ref: 1/i)).toBeTruthy();
    expect(screen.getByText(/Doc A/i)).toBeTruthy();
    expect(screen.getByText(/Apple_MSA_2026\.pdf/i)).toBeTruthy();
    expect(screen.getByText(/Page 4/i)).toBeTruthy();
    expect(screen.getByText(/VERIFIED/i)).toBeTruthy();
    expect(screen.getByText(/\(95%\)/i)).toBeTruthy();
    expect(screen.getByText(/SECTION 14: INDEMNIFICATION & LIABILITY/i)).toBeTruthy();
    expect(screen.getByText(/The total aggregate liability under this Agreement/i)).toBeTruthy();

    // Verify clicking card triggers onSelectCitation
    const card = screen.getByTestId('grounded-source-card-1');
    fireEvent.click(card);
    expect(onSelectSpy).toHaveBeenCalledWith(mockCitation);
  });

  it('renders Grounded Sources section inside SynthesisView when citations are provided', () => {
    const mockCitations = [
      {
        citation_index: 1,
        page_number: 2,
        confidence: 0.91,
        status: 'VERIFIED',
        section_heading: 'SECTION 4: GOVERNING LAW',
        text_snippet: 'This Agreement is governed by Delaware state law.',
        document_title: 'Microsoft_10K.pdf',
      },
      {
        citation_index: 2,
        page_number: 7,
        confidence: 0.88,
        status: 'VERIFIED',
        section_heading: 'SECTION 8: TERMINATION',
        text_snippet: 'Either party may terminate upon thirty days written notice.',
        document_title: 'Apple_10K.pdf',
      },
    ];

    render(
      <SynthesisView
        text="The contract is governed by Delaware law [Ref:1] and terminable on 30 days notice [Ref:2]."
        isStreaming={false}
        citations={mockCitations}
        onSelectCitation={vi.fn()}
        onInspectPdf={vi.fn()}
      />
    );

    // Verify section header and count
    expect(screen.getByText(/GROUNDED SOURCES & LOCATION REFERENCES/i)).toBeTruthy();
    expect(screen.getByText(/2 Verified Sources/i)).toBeTruthy();

    // Verify both source cards are present
    expect(screen.getByTestId('grounded-source-card-1')).toBeTruthy();
    expect(screen.getByTestId('grounded-source-card-2')).toBeTruthy();
    expect(screen.getByText(/SECTION 4: GOVERNING LAW/i)).toBeTruthy();
    expect(screen.getByText(/SECTION 8: TERMINATION/i)).toBeTruthy();
  });
});
