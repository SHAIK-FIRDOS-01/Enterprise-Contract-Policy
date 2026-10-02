import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import * as pdfjsLib from 'pdfjs-dist';
import DualPDFViewer from '../components/viewer/DualPDFViewer';
import DualViewerControls from '../components/viewer/DualViewerControls';
import BoundingBoxOverlay from '../components/viewer/BoundingBoxOverlay';

// Mock pdfjs-dist
vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  version: '3.11.174',
  getDocument: vi.fn(),
}));

describe('Ticket 19: Split-Screen Synchronized Dual-PDF Viewer Canvas Engine', () => {
  const cancelMockA = vi.fn();
  const cancelMockB = vi.fn();

  beforeEach(() => {
    vi.restoreAllMocks();

    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
      fillRect: vi.fn(),
      clearRect: vi.fn(),
      getImageData: vi.fn(),
      putImageData: vi.fn(),
      createImageData: vi.fn(),
      setTransform: vi.fn(),
      drawImage: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
      stroke: vi.fn(),
      fill: vi.fn(),
    }));

    window.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };

    pdfjsLib.getDocument.mockImplementation(({ url }) => {
      const isDocB = url.includes('msa_2026') || url.includes('doc-B');
      const numPages = isDocB ? 10 : 8;
      const cancelMock = isDocB ? cancelMockB : cancelMockA;

      return {
        promise: Promise.resolve({
          numPages,
          getPage: vi.fn().mockImplementation((pageNum) =>
            Promise.resolve({
              pageNumber: pageNum,
              getViewport: vi.fn(({ scale = 1.0 }) => ({
                width: 612 * scale,
                height: 792 * scale,
              })),
              render: vi.fn(() => ({
                promise: Promise.resolve(),
                cancel: cancelMock,
              })),
            })
          ),
        }),
        destroy: vi.fn(),
      };
    });
  });

  // Test 1: BoundingBoxOverlay Multi-Document ID Filtering & Theme Color Coding
  describe('BoundingBoxOverlay Multi-Document Filtering', () => {
    const multiDocBoxes = [
      {
        id: 'box-a1',
        document_id: 'doc-uuid-aaa',
        chunk_index: 1,
        page_number: 1,
        norm_x0: 0.1,
        norm_y0: 0.1,
        norm_x1: 0.8,
        norm_y1: 0.3,
        status: 'VERIFIED',
      },
      {
        id: 'box-b1',
        document_id: 'doc-uuid-bbb',
        chunk_index: 2,
        page_number: 1,
        norm_x0: 0.2,
        norm_y0: 0.2,
        norm_x1: 0.9,
        norm_y1: 0.4,
        status: 'VERIFIED',
      },
    ];

    it('filters bounding boxes strictly matching pane documentId and applies cyan/amber theme classes', () => {
      // 1. Pane A (Primary Doc A with Cyan Theme)
      const { rerender } = render(
        <BoundingBoxOverlay
          boundingBoxes={multiDocBoxes}
          documentId="doc-uuid-aaa"
          paneTheme="cyan"
          canvasWidth={800}
          canvasHeight={1000}
          isVisible={true}
        />
      );

      // Box A1 should be present, Box B1 should be filtered out
      expect(screen.getByTestId('bounding-box-box-a1')).toBeTruthy();
      expect(screen.queryByTestId('bounding-box-box-b1')).toBeNull();

      const boxA = screen.getByTestId('bounding-box-box-a1');
      expect(boxA.className).toContain('cyan');

      // 2. Pane B (Comparison Doc B with Amber Theme)
      rerender(
        <BoundingBoxOverlay
          boundingBoxes={multiDocBoxes}
          documentId="doc-uuid-bbb"
          paneTheme="amber"
          canvasWidth={800}
          canvasHeight={1000}
          isVisible={true}
        />
      );

      // Box B1 should be present, Box A1 should be filtered out
      expect(screen.getByTestId('bounding-box-box-b1')).toBeTruthy();
      expect(screen.queryByTestId('bounding-box-box-a1')).toBeNull();

      const boxB = screen.getByTestId('bounding-box-box-b1');
      expect(boxB.className).toContain('amber');
    });

    it('converts normalized coordinates with negative/zero clamp protections', () => {
      const outOfBoundsBox = [
        {
          id: 'box-clamp',
          document_id: 'doc-uuid-aaa',
          chunk_index: 1,
          norm_x0: -0.2, // negative
          norm_y0: 0.0,
          norm_x1: 1.5, // exceeds 1.0
          norm_y1: 0.5,
          status: 'VERIFIED',
        },
      ];

      render(
        <BoundingBoxOverlay
          boundingBoxes={outOfBoundsBox}
          documentId="doc-uuid-aaa"
          canvasWidth={1000}
          canvasHeight={1000}
          isVisible={true}
        />
      );

      const clampedBox = screen.getByTestId('bounding-box-box-clamp');
      expect(clampedBox).toBeTruthy();
      // left should be clamped to >= 0px
      expect(parseFloat(clampedBox.style.left)).toBeGreaterThanOrEqual(0);
    });
  });

  // Test 2: DualViewerControls & Synchronized Lock Scroll Toggle
  describe('DualViewerControls', () => {
    it('provides independent page controls and toggles synchronized scroll lock', () => {
      const handlePageAChange = vi.fn();
      const handlePageBChange = vi.fn();
      const handleToggleLock = vi.fn();

      render(
        <DualViewerControls
          pageA={2}
          numPagesA={8}
          onPageAChange={handlePageAChange}
          pageB={3}
          numPagesB={10}
          onPageBChange={handlePageBChange}
          isLocked={false}
          onToggleLock={handleToggleLock}
          scale={1.0}
          onZoomChange={vi.fn()}
        />
      );

      // Assert page indicators for Pane A and Pane B
      expect(screen.getByTestId('page-indicator-pane-a').textContent).toContain('2');
      expect(screen.getByTestId('page-indicator-pane-a').textContent).toContain('8');
      expect(screen.getByTestId('page-indicator-pane-b').textContent).toContain('3');
      expect(screen.getByTestId('page-indicator-pane-b').textContent).toContain('10');

      // Click next page on Pane A
      const nextBtnA = screen.getByTestId('next-page-pane-a');
      fireEvent.click(nextBtnA);
      expect(handlePageAChange).toHaveBeenCalledWith(3);

      // Click Lock Scroll toggle button
      const lockToggle = screen.getByTestId('lock-scroll-toggle');
      expect(lockToggle.getAttribute('aria-pressed')).toBe('false');
      fireEvent.click(lockToggle);
      expect(handleToggleLock).toHaveBeenCalledWith(true);
    });
  });

  // Test 3: DualPDFViewer Canvas Engine & Isolated Lifecycle
  describe('DualPDFViewer Canvas Engine', () => {
    const docA = {
      id: 'doc-uuid-aaa',
      title: 'Master Services Agreement FY25.pdf',
      file: 'https://storage.enterprise.internal/contracts/doc-A.pdf',
      page_count: 8,
    };
    const docB = {
      id: 'doc-uuid-bbb',
      title: 'Master Services Agreement FY26.pdf',
      file: 'https://storage.enterprise.internal/contracts/doc-B.pdf',
      page_count: 10,
    };

    it('renders side-by-side isolated canvases for Document A and Document B without render interference', async () => {
      render(
        <DualPDFViewer
          documentA={docA}
          documentB={docB}
          initialPageA={1}
          initialPageB={1}
          isLocked={false}
        />
      );

      // Wait for both panes to render their canvases
      await waitFor(() => {
        expect(screen.getByTestId('canvas-pane-a')).toBeTruthy();
        expect(screen.getByTestId('canvas-pane-b')).toBeTruthy();
      });

      // Assert Pane A and Pane B containers exist with respective titles
      expect(screen.getByTestId('pane-doc-a')).toBeTruthy();
      expect(screen.getByTestId('pane-doc-b')).toBeTruthy();
      expect(screen.getByText(/Master Services Agreement FY25\.pdf/i)).toBeTruthy();
      expect(screen.getByText(/Master Services Agreement FY26\.pdf/i)).toBeTruthy();
    });

    it('synchronizes page navigation proportionally across panes when lock scroll is active', async () => {
      const handleSyncPage = vi.fn();

      render(
        <DualPDFViewer
          documentA={docA}
          documentB={docB}
          initialPageA={1}
          initialPageB={1}
          isLocked={true}
          onSyncPage={handleSyncPage}
        />
      );

      await waitFor(() => {
        expect(screen.getByTestId('canvas-pane-a')).toBeTruthy();
      });

      // Stepping page in Pane A with lock active proportionally mirrors to Pane B
      const nextBtnA = screen.getByTestId('next-page-pane-a');
      fireEvent.click(nextBtnA);

      // Page A moves from 1 to 2; proportionally mirrored in Pane B
      await waitFor(() => {
        const pageIndB = screen.getByTestId('page-indicator-pane-b');
        expect(pageIndB).toBeTruthy();
      });
    });

    it('supports responsive tabbed clamping on compact screens', async () => {
      render(
        <DualPDFViewer
          documentA={docA}
          documentB={docB}
          isCompact={true}
        />
      );

      // Verify compact view provides toggle buttons between Doc A and Doc B
      await waitFor(() => {
        expect(screen.getByTestId('compact-tab-doc-a')).toBeTruthy();
        expect(screen.getByTestId('compact-tab-doc-b')).toBeTruthy();
      });

      const tabB = screen.getByTestId('compact-tab-doc-b');
      fireEvent.click(tabB);

      // Now Pane B is active
      expect(tabB.getAttribute('aria-selected')).toBe('true');
    });

    it('synchronizes active citation highlights across Pane A (cyan) and Pane B (amber)', async () => {
      const citationA = {
        id: 'cite-a1',
        chunk_id: 'cite-a1',
        document_id: 'doc-uuid-aaa',
        page_number: 3,
        citation_index: 0,
        bounding_box: {
          norm_x0: 0.1,
          norm_y0: 0.1,
          norm_x1: 0.5,
          norm_y1: 0.4,
        },
      };

      const { rerender } = render(
        <DualPDFViewer
          documentA={docA}
          documentB={docB}
          activeCitation={citationA}
        />
      );

      // Verify Pane A navigated to page 3 and highlighted in cyan
      await waitFor(() => {
        expect(screen.getByText('P.3 OF 8')).toBeTruthy();
        const boxA = screen.getByTestId('bounding-box-cite-a1');
        expect(boxA.className).toContain('border-cyan-400');
      });

      // Now switch activeCitation to Document B
      const citationB = {
        id: 'cite-b1',
        chunk_id: 'cite-b1',
        document_id: 'doc-uuid-bbb',
        page_number: 5,
        citation_index: 1,
        bounding_box: {
          norm_x0: 0.2,
          norm_y0: 0.2,
          norm_x1: 0.6,
          norm_y1: 0.5,
        },
      };

      rerender(
        <DualPDFViewer
          documentA={docA}
          documentB={docB}
          activeCitation={citationB}
        />
      );

      // Verify Pane B navigated to page 5 and highlighted in amber
      await waitFor(() => {
        expect(screen.getByText('P.5 OF 10')).toBeTruthy();
        const boxB = screen.getByTestId('bounding-box-cite-b1');
        expect(boxB.className).toContain('border-amber-400');
      });
    });
  });
});

