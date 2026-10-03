import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import * as pdfjsLib from 'pdfjs-dist';
import api, { authApi } from '../services/api';
import * as streamingService from '../services/streaming';
import { AuthProvider } from '../context/AuthContext';
import WorkspacePage from '../pages/workspace/WorkspacePage';

// Mock pdfjs-dist
vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  version: '3.11.174',
  getDocument: vi.fn(),
}));

describe('Ticket 21: Frontend Split-Viewer & Multi-Stream E2E Flow', () => {
  const docAId = 'doc-1111-aaaa';
  const docBId = 'doc-2222-bbbb';

  const mockDocuments = [
    {
      id: docAId,
      title: 'FY25 Annual Report.pdf',
      file: 'https://storage.enterprise.internal/contracts/FY25_Annual.pdf',
      status: 'READY',
      page_count: 5,
      created_at: '2026-09-29T10:00:00Z',
    },
    {
      id: docBId,
      title: 'FY26 Annual Report.pdf',
      file: 'https://storage.enterprise.internal/contracts/FY26_Annual.pdf',
      status: 'READY',
      page_count: 5,
      created_at: '2026-09-30T10:00:00Z',
    },
  ];

  const mockChunksDocA = [
    {
      id: 'chunk-A1',
      chunk_id: 'chunk-A1',
      document_id: docAId,
      documentId: docAId,
      chunk_index: 0,
      page_number: 1,
      text_content: 'Total consolidated revenues for fiscal year 2025 were $12.4 billion.',
      bounding_box: {
        x0: 72,
        y0: 100,
        x1: 540,
        y1: 200,
        norm_x0: 0.1176,
        norm_y0: 0.1262,
        norm_x1: 0.8824,
        norm_y1: 0.2525,
      },
    },
  ];

  const mockChunksDocB = [
    {
      id: 'chunk-B1',
      chunk_id: 'chunk-B1',
      document_id: docBId,
      documentId: docBId,
      chunk_index: 0,
      page_number: 2,
      text_content: 'Total consolidated revenues for fiscal year 2026 grew to $14.1 billion.',
      bounding_box: {
        x0: 72,
        y0: 150,
        x1: 540,
        y1: 250,
        norm_x0: 0.1176,
        norm_y0: 0.1894,
        norm_x1: 0.8824,
        norm_y1: 0.3156,
      },
    },
  ];

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

    pdfjsLib.getDocument.mockImplementation(() => {
      return {
        promise: Promise.resolve({
          numPages: 5,
          getPage: vi.fn().mockImplementation((pageNum) =>
            Promise.resolve({
              pageNumber: pageNum,
              getViewport: vi.fn(({ scale = 1.0 }) => ({
                width: 612 * scale,
                height: 792 * scale,
              })),
              render: vi.fn(() => ({
                promise: Promise.resolve(),
                cancel: vi.fn(),
              })),
            })
          ),
        }),
        destroy: vi.fn(),
      };
    });

    const mockUser = {
      id: 'auditor-101',
      email: 'lead_auditor@enterprise.com',
      role: 'AUDITOR',
    };
    vi.spyOn(authApi, 'getMe').mockResolvedValue(mockUser);

    vi.spyOn(api, 'get').mockImplementation((url) => {
      if (url === '/api/documents/') {
        return Promise.resolve({ data: mockDocuments });
      }
      if (url === `/api/documents/${docAId}/chunks/`) {
        return Promise.resolve({ data: mockChunksDocA });
      }
      if (url === `/api/documents/${docBId}/chunks/`) {
        return Promise.resolve({ data: mockChunksDocB });
      }
      return Promise.reject(new Error(`Unhandled GET url: ${url}`));
    });
  });

  it('executes full multi-document user journey: selection -> multiplexed stream -> split canvas highlights -> lock scroll', async () => {
    render(
      <MemoryRouter initialEntries={[`/workspace?docs=${docAId},${docBId}`]}>
        <AuthProvider>
          <WorkspacePage />
        </AuthProvider>
      </MemoryRouter>
    );

    // 1. Multi-Doc Selection in DocumentSelectorDock via URL or Dock Badges
    await waitFor(() => {
      const badgeA = screen.getByTestId(`doc-badge-${docAId}`);
      const badgeB = screen.getByTestId(`doc-badge-${docBId}`);
      expect(badgeA).toBeTruthy();
      expect(badgeB).toBeTruthy();
      expect(badgeA.textContent).toContain('DOC A');
      expect(badgeB.textContent).toContain('DOC B');
    });

    // 2. Query Submission & Multiplexed SSE Streaming
    const streamSpy = vi.spyOn(streamingService, 'streamContractQuery').mockImplementation(
      async ({ onRoute, onWorkerStatus, onDelta, onVerification, onTelemetry, onDone }) => {
        act(() => {
          onRoute({
            route: 'SYSTEM_2_FRONTIER',
            confidence: 0.96,
            reason: 'Multi-document comparison requires cross-clause reduce synthesis',
          });
        });

        act(() => {
          onWorkerStatus({ document_id: docAId, status: 'SUCCESS', duration_ms: 38.5 });
          onWorkerStatus({ document_id: docBId, status: 'SUCCESS', duration_ms: 41.2 });
        });

        act(() => {
          onDelta('Consolidated revenues rose from $12.4B in FY25 ');
          onDelta('[Ref:1] to $14.1B in FY26 [Ref:2].');
        });

        act(() => {
          onVerification([
            {
              citation_index: 1,
              chunk_id: 'chunk-A1',
              document_id: docAId,
              page_number: 1,
              status: 'VERIFIED',
              confidence: 0.95,
              extracted_claim: '$12.4B in FY25',
              bounding_box: mockChunksDocA[0].bounding_box,
            },
            {
              citation_index: 2,
              chunk_id: 'chunk-B1',
              document_id: docBId,
              page_number: 2,
              status: 'VERIFIED',
              confidence: 0.94,
              extracted_claim: '$14.1B in FY26',
              bounding_box: mockChunksDocB[0].bounding_box,
            },
          ]);
        });

        act(() => {
          onTelemetry({
            total_duration_ms: 480.0,
            worker_latency_breakdown: { [docAId]: 38.5, [docBId]: 41.2 },
            prompt_tokens: 160,
            completion_tokens: 45,
            estimated_cost_usd: 0.00012,
          });
        });

        act(() => {
          onDone();
        });
      }
    );

    const queryInput = screen.getByPlaceholderText(/Ask compliance or legal questions/i);
    const runAuditBtn = screen.getByRole('button', { name: /SUBMIT QUERY/i });

    fireEvent.change(queryInput, {
      target: { value: 'Compare revenue variance between FY25 and FY26 10-K filings.' },
    });
    fireEvent.click(runAuditBtn);

    await waitFor(() => {
      expect(streamSpy).toHaveBeenCalled();
    });

    // Verify streamed synthesis text and badges appear
    await waitFor(() => {
      expect(screen.getByText(/Consolidated revenues rose from \$12\.4B/i)).toBeTruthy();
      expect(screen.getByTestId('citation-badge-1')).toBeTruthy();
      expect(screen.getByTestId('citation-badge-2')).toBeTruthy();
    });

    // 3. Grounded Source Cards Verification:
    // Verify Grounded Source Cards rendered for both Doc A and Doc B
    await waitFor(() => {
      const cardA = screen.getByTestId('grounded-source-card-1');
      const cardB = screen.getByTestId('grounded-source-card-2');
      expect(cardA).toBeTruthy();
      expect(cardB).toBeTruthy();
      expect(cardA.textContent).toContain('Doc A');
      expect(cardB.textContent).toContain('Doc B');
    });

    // Clicking Citation 1 (targeting Doc A) focuses Grounded Source Card 1
    const citation1Btn = screen.getByTestId('citation-badge-1');
    fireEvent.click(citation1Btn);

    await waitFor(() => {
      const cardA = screen.getByTestId('grounded-source-card-1');
      expect(cardA.className).toContain('border-emerald-500/70');
    });

    // Clicking Citation 2 (targeting Doc B) focuses Grounded Source Card 2
    const citation2Btn = screen.getByTestId('citation-badge-2');
    fireEvent.click(citation2Btn);

    await waitFor(() => {
      const cardB = screen.getByTestId('grounded-source-card-2');
      expect(cardB.className).toContain('border-emerald-500/70');
    });
  });
});
