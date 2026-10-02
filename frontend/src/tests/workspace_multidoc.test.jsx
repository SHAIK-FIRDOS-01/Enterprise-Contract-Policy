import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DocumentSelectorDock from '../components/workspace/DocumentSelectorDock';
import ModeToggle from '../components/workspace/ModeToggle';
import SynthesisView from '../components/workspace/SynthesisView';

describe('Ticket 18: Multi-Document Workspace UI & Institutional A/B Mode Toggle', () => {
  const sampleDocuments = [
    { id: 'doc-1111-aaaa', title: 'Master Services Agreement FY25.pdf', page_count: 12 },
    { id: 'doc-2222-bbbb', title: 'Master Services Agreement FY26.pdf', page_count: 15 },
    { id: 'doc-3333-cccc', title: 'Non-Disclosure Agreement 2024.pdf', page_count: 4 },
    { id: 'doc-4444-dddd', title: 'Data Processing Addendum v3.pdf', page_count: 8 },
  ];

  // Test 1: Document Dock Selection and Bounded Limits
  describe('DocumentSelectorDock', () => {
    it('renders selected documents with Doc A (cyan) and Doc B (amber/indigo) badges', () => {
      const handleToggle = vi.fn();
      const handleSelectViewerDoc = vi.fn();

      render(
        <DocumentSelectorDock
          documents={sampleDocuments}
          selectedDocIds={['doc-1111-aaaa', 'doc-2222-bbbb']}
          activeViewerDocId="doc-1111-aaaa"
          onToggleDocument={handleToggle}
          onSelectViewerDoc={handleSelectViewerDoc}
        />
      );

      // Verify Doc A and Doc B badges exist
      const docABadge = screen.getByTestId('doc-badge-doc-1111-aaaa');
      const docBBadge = screen.getByTestId('doc-badge-doc-2222-bbbb');

      expect(docABadge).toBeTruthy();
      expect(docBBadge).toBeTruthy();

      expect(docABadge.textContent).toContain('DOC A');
      expect(docBBadge.textContent).toContain('DOC B');

      // Verify Doc A has cyan styling and Doc B has amber/indigo styling
      expect(docABadge.className).toMatch(/cyan/i);
      expect(docBBadge.className).toMatch(/amber/i);

      // Clicking badge triggers onSelectViewerDoc
      fireEvent.click(docBBadge);
      expect(handleSelectViewerDoc).toHaveBeenCalledWith('doc-2222-bbbb');
    });

    it('toggles document selection and enforces maximum limit of 8 documents', () => {
      const handleToggle = vi.fn();

      const { rerender } = render(
        <DocumentSelectorDock
          documents={sampleDocuments}
          selectedDocIds={['doc-1111-aaaa']}
          activeViewerDocId="doc-1111-aaaa"
          onToggleDocument={handleToggle}
          maxDocuments={8}
        />
      );

      // Open document picker dropdown / selector
      const addButton = screen.getByTestId('add-document-button');
      fireEvent.click(addButton);

      // Select second document
      const doc2Option = screen.getByTestId('dock-select-doc-2222-bbbb');
      fireEvent.click(doc2Option);
      expect(handleToggle).toHaveBeenCalledWith('doc-2222-bbbb');

      // Test maximum limit check
      const eightDocIds = [
        'd1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8',
      ];
      rerender(
        <DocumentSelectorDock
          documents={sampleDocuments}
          selectedDocIds={eightDocIds}
          activeViewerDocId="d1"
          onToggleDocument={handleToggle}
          maxDocuments={8}
        />
      );

      expect(screen.getByText(/MAX\s*\(\d+\/\d+\)/i)).toBeTruthy();
    });

    it('renders real-time worker status indicators for PENDING, PROCESSING, READY, and TIMEOUT', () => {
      const workerStatuses = {
        'doc-1111-aaaa': { status: 'PROCESSING', duration_ms: 120 },
        'doc-2222-bbbb': { status: 'TIMEOUT', duration_ms: 250 },
      };

      const { rerender } = render(
        <DocumentSelectorDock
          documents={sampleDocuments}
          selectedDocIds={['doc-1111-aaaa', 'doc-2222-bbbb']}
          activeViewerDocId="doc-1111-aaaa"
          workerStatuses={workerStatuses}
        />
      );

      expect(screen.getByTestId('worker-status-doc-1111-aaaa').textContent).toMatch(/PROCESSING/i);
      expect(screen.getByTestId('worker-status-doc-2222-bbbb').textContent).toMatch(/TIMEOUT/i);

      // Update worker status to READY
      rerender(
        <DocumentSelectorDock
          documents={sampleDocuments}
          selectedDocIds={['doc-1111-aaaa', 'doc-2222-bbbb']}
          activeViewerDocId="doc-1111-aaaa"
          workerStatuses={{
            'doc-1111-aaaa': { status: 'READY', duration_ms: 85 },
            'doc-2222-bbbb': { status: 'SUCCESS', duration_ms: 90 },
          }}
        />
      );

      expect(screen.getByTestId('worker-status-doc-1111-aaaa').textContent).toMatch(/READY|SUCCESS/i);
      expect(screen.getByTestId('worker-status-doc-2222-bbbb').textContent).toMatch(/READY|SUCCESS/i);
    });
  });

  // Test 2: Institutional A/B Mode Toggle
  describe('ModeToggle', () => {
    it('toggles between DUAL-SYSTEM (AUTONOMOUS) and FRONTIER-ONLY (BENCHMARK) and passes force_frontier flag', () => {
      const handleModeChange = vi.fn();

      const { rerender } = render(
        <ModeToggle
          mode="DUAL_SYSTEM"
          onChange={handleModeChange}
        />
      );

      const dualBtn = screen.getByTestId('mode-toggle-dual');
      const frontierBtn = screen.getByTestId('mode-toggle-frontier');

      expect(dualBtn.getAttribute('aria-pressed')).toBe('true');
      expect(frontierBtn.getAttribute('aria-pressed')).toBe('false');

      // Click Frontier mode
      fireEvent.click(frontierBtn);
      expect(handleModeChange).toHaveBeenCalledWith('FRONTIER_ONLY', true);

      // Rerender with FRONTIER_ONLY
      rerender(
        <ModeToggle
          mode="FRONTIER_ONLY"
          onChange={handleModeChange}
        />
      );

      expect(dualBtn.getAttribute('aria-pressed')).toBe('false');
      expect(frontierBtn.getAttribute('aria-pressed')).toBe('true');

      // Click Dual mode
      fireEvent.click(dualBtn);
      expect(handleModeChange).toHaveBeenCalledWith('DUAL_SYSTEM', false);
    });
  });

  // Test 3: Multi-Document Citation Parsing and Routing in SynthesisView
  describe('SynthesisView Multi-Document & Routing Integration', () => {
    it('displays active route indicator badge in synthesis header', () => {
      // 1. System 1 Fast Path Route
      const { rerender } = render(
        <SynthesisView
          text="The liability cap is $5,000,000."
          routeInfo={{
            route: 'SYSTEM_1_FAST_PATH',
            confidence: 0.94,
            reason: 'High lexical and embedding confidence match.',
          }}
          citations={[]}
        />
      );

      const routeBadgeFast = screen.getByTestId('synthesis-route-badge');
      expect(routeBadgeFast.textContent).toContain('SYSTEM 1: EXTRACTIVE FAST-PATH');

      // 2. System 2 Frontier Route
      rerender(
        <SynthesisView
          text="Comparison shows FY26 indemnification covers IP infringements whereas FY25 does not [Ref: 1]."
          routeInfo={{
            route: 'SYSTEM_2_FRONTIER',
            confidence: 0.65,
            reason: 'Multi-document comparative analysis required.',
          }}
          citations={[]}
        />
      );

      const routeBadgeFrontier = screen.getByTestId('synthesis-route-badge');
      expect(routeBadgeFrontier.textContent).toContain('SYSTEM 2: FRONTIER REDUCE SYNTHESIS');
    });

    it('renders multi-document citation chips with Doc A and Doc B labels and dispatches target document on click', () => {
      const handleSelectCitation = vi.fn();
      const mockCitations = [
        {
          citation_index: 1,
          document_id: 'doc-1111-aaaa',
          page_number: 92,
          chunk_id: 'c1',
          status: 'VERIFIED',
          confidence: 0.95,
          bounding_box: { norm_x0: 0.1, norm_y0: 0.1, norm_x1: 0.9, norm_y1: 0.2 },
        },
        {
          citation_index: 2,
          document_id: 'doc-2222-bbbb',
          page_number: 34,
          chunk_id: 'c2',
          status: 'VERIFIED',
          confidence: 0.88,
          bounding_box: { norm_x0: 0.2, norm_y0: 0.3, norm_x1: 0.8, norm_y1: 0.4 },
        },
      ];

      const documentMap = {
        'doc-1111-aaaa': { label: 'Doc A', title: 'MSA FY25' },
        'doc-2222-bbbb': { label: 'Doc B', title: 'MSA FY26' },
      };

      render(
        <SynthesisView
          text="Clause in FY25 restricts liability [Ref: 1], whereas FY26 increases coverage [Ref: 2]."
          citations={mockCitations}
          documentMap={documentMap}
          onSelectCitation={handleSelectCitation}
        />
      );

      const badge1 = screen.getByTestId('citation-badge-1');
      const badge2 = screen.getByTestId('citation-badge-2');

      expect(badge1.textContent).toMatch(/Doc A.*p\.92/i);
      expect(badge2.textContent).toMatch(/Doc B.*p\.34/i);

      // Clicking badge 2 dispatches onSelectCitation with document_id and coordinates
      fireEvent.click(badge2);
      expect(handleSelectCitation).toHaveBeenCalledWith(
        expect.objectContaining({
          citation_index: 2,
          document_id: 'doc-2222-bbbb',
          page_number: 34,
        })
      );
    });
  });
});
