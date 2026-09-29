import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import * as pdfjsLib from 'pdfjs-dist';
import api, { authApi } from '../services/api';
import * as streamingService from '../services/streaming';
import { AuthProvider } from '../context/AuthContext';
import WorkspacePage from '../pages/workspace/WorkspacePage';
import LoginPage from '../pages/auth/LoginPage';

// Mock pdfjs-dist
vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  version: '3.11.174',
  getDocument: vi.fn(),
}));

describe('Ticket 13: Frontend End-to-End Workstation Flow Verification', () => {
  beforeEach(() => {
    vi.restoreAllMocks();

    // Mock HTMLCanvasElement.getContext for jsdom
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

    // Setup pdfjs-dist mock response
    pdfjsLib.getDocument.mockReturnValue({
      promise: Promise.resolve({
        numPages: 3,
        getPage: vi.fn().mockImplementation((pageNum) =>
          Promise.resolve({
            pageNumber: pageNum,
            getViewport: vi.fn(({ scale = 1.0 }) => ({
              width: 612 * scale,
              height: 792 * scale,
            })),
            render: vi.fn(() => ({
              promise: Promise.resolve(),
            })),
          })
        ),
      }),
      destroy: vi.fn(),
    });
  });

  it('executes full critical user flow: login -> document select -> query submission -> token streaming -> citation badge click -> PDF page jump & bounding box highlight', async () => {
    // -----------------------------------------------------------------------
    // Stage 1: User Login & Session Bootstrap
    // -----------------------------------------------------------------------
    const mockUser = {
      id: 'user-uuid-101',
      email: 'lead_auditor@enterprise.com',
      role: 'AUDITOR',
    };

    vi.spyOn(authApi, 'getMe').mockResolvedValue(mockUser);
    vi.spyOn(authApi, 'login').mockResolvedValue({
      user: mockUser,
      message: 'Login successful',
    });

    const { unmount: unmountLogin } = render(
      <BrowserRouter>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </BrowserRouter>
    );

    // Verify institutional brand headers
    expect(screen.getByText('OPERATOR AUTHENTICATION')).toBeTruthy();

    const emailInput = screen.getByLabelText(/OPERATOR EMAIL/i);
    const passwordInput = screen.getByLabelText(/CREDENTIAL/i);
    const submitAuthBtn = screen.getByRole('button', { name: /AUTHENTICATE WORKSTATION/i });

    fireEvent.change(emailInput, { target: { value: 'lead_auditor@enterprise.com' } });
    fireEvent.change(passwordInput, { target: { value: 'ProductionPassword2026!' } });
    fireEvent.click(submitAuthBtn);

    await waitFor(() => {
      expect(authApi.login).toHaveBeenCalledWith({
        email: 'lead_auditor@enterprise.com',
        password: 'ProductionPassword2026!',
      });
    });

    unmountLogin();

    // -----------------------------------------------------------------------
    // Stage 2: Workspace Mounting & Document Selection
    // -----------------------------------------------------------------------
    const mockDocuments = [
      {
        id: 'doc-uuid-888',
        title: 'Master Services Agreement 2026.pdf',
        file: 'https://storage.enterprise.internal/contracts/msa_2026.pdf',
        status: 'READY',
        page_count: 3,
        created_at: '2026-09-29T10:00:00Z',
      },
    ];

    const mockInitialChunks = [
      {
        id: 'chunk-uuid-001',
        chunk_id: 'chunk-uuid-001',
        chunk_index: 0,
        page_number: 1,
        text_content: 'Clause 1: Scope of Cloud Compliance Services.',
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

    vi.spyOn(api, 'get').mockImplementation((url) => {
      if (url === '/api/documents/') {
        return Promise.resolve({ data: mockDocuments });
      }
      if (url === '/api/documents/doc-uuid-888/chunks/') {
        return Promise.resolve({ data: mockInitialChunks });
      }
      return Promise.reject(new Error(`Unhandled GET url: ${url}`));
    });

    render(
      <BrowserRouter>
        <AuthProvider>
          <WorkspacePage />
        </AuthProvider>
      </BrowserRouter>
    );

    // Wait for document dropdown to load
    await waitFor(() => {
      expect(screen.getByDisplayValue(/Master Services Agreement 2026\.pdf/i)).toBeTruthy();
    });

    // Check PDF viewer controls initial state: Page 1 of 3
    await waitFor(() => {
      const pageIndicator = screen.getByTestId('page-indicator');
      expect(pageIndicator.textContent).toContain('1');
      expect(pageIndicator.textContent).toContain('3');
    });

    // -----------------------------------------------------------------------
    // Stage 3: Query Submission & SSE Token Streaming
    // -----------------------------------------------------------------------
    const streamSpy = vi.spyOn(streamingService, 'streamContractQuery').mockImplementation(
      async ({ onDelta, onVerification, onTelemetry, onDone }) => {
        // Stream token deltas
        act(() => {
          onDelta('The total aggregate liability under this Agreement is strictly capped at ');
        });
        act(() => {
          onDelta('$500,000 [Ref:1] pursuant to Section 12.');
        });

        // Verification payload with high confidence on Page 2
        act(() => {
          onVerification([
            {
              citation_index: 1,
              chunk_id: 'chunk-uuid-999',
              status: 'VERIFIED',
              confidence: 0.94,
              page_number: 2,
              extracted_claim: 'strictly capped at $500,000',
              bounding_box: {
                x0: 72,
                y0: 150,
                x1: 540,
                y1: 280,
                norm_x0: 0.1176,
                norm_y0: 0.1894,
                norm_x1: 0.8824,
                norm_y1: 0.3535,
              },
            },
          ]);
        });

        // Telemetry payload
        act(() => {
          onTelemetry({
            duration_ms: 145.2,
            prompt_tokens: 180,
            completion_tokens: 42,
            total_tokens: 222,
            estimated_cost_usd: 0.000042,
          });
        });

        act(() => {
          onDone({ total_chunks: 1 });
        });
      }
    );

    const queryInput = screen.getByPlaceholderText(/Ask compliance or legal questions/i);
    const submitQueryBtn = screen.getByRole('button', { name: /SUBMIT QUERY/i });

    fireEvent.change(queryInput, {
      target: { value: 'What is the aggregate limitation of liability cap?' },
    });
    fireEvent.click(submitQueryBtn);

    expect(streamSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'What is the aggregate limitation of liability cap?',
        documentId: 'doc-uuid-888',
      })
    );

    // Verify token streaming rendered the synthesized answer
    await waitFor(() => {
      expect(screen.getByText(/strictly capped at \$500,000/i)).toBeTruthy();
    });

    // Verify citation badge [Ref: 1] rendered with emerald (VERIFIED) style
    const citationBadge = await screen.findByTestId('citation-badge-1');
    expect(citationBadge).toBeTruthy();
    expect(citationBadge.className).toContain('text-emerald-400');

    // Verify telemetry metrics rendered in footer
    expect(screen.getByText(/0\.15s/i)).toBeTruthy();
    expect(screen.getByText(/180 in \/ 42 out/i)).toBeTruthy();

    // -----------------------------------------------------------------------
    // Stage 4: One-Click Citation Sync -> PDF Viewer Page Jump & Bounding Box Focus
    // -----------------------------------------------------------------------
    // Viewer is initially on Page 1
    const pageIndicatorInit = screen.getByTestId('page-indicator');
    expect(pageIndicatorInit.textContent).toContain('1');

    // Click interactive [Ref: 1] badge
    fireEvent.click(citationBadge);

    // Invariant Check 1: PDF Viewer immediately jumps to cited page (Page 2)
    await waitFor(() => {
      const pageIndicatorActive = screen.getByTestId('page-indicator');
      expect(pageIndicatorActive.textContent).toContain('2');
    });

    // Invariant Check 2: Active bounding box is rendered with emerald glow
    const boundingBox = await screen.findByTestId('bounding-box-chunk-uuid-999');
    expect(boundingBox).toBeTruthy();
    expect(boundingBox.className).toContain('border-emerald-400');
    expect(boundingBox.className).toContain('bg-emerald-500/30');

    // -----------------------------------------------------------------------
    // Stage 5: Switch to Citation Inspector Tab
    // -----------------------------------------------------------------------
    const citationsTabBtn = screen.getByRole('button', { name: /^CITATIONS\s*\(/i });
    fireEvent.click(citationsTabBtn);

    // Inspector card displays confidence, Ref: 1, and VERIFIED badge
    await waitFor(() => {
      expect(screen.getByText(/GROUND-TRUTH CITATIONS/i)).toBeTruthy();
      expect(screen.getByText(/VERIFIED/i)).toBeTruthy();
      expect(screen.getByText(/CONF:/i)).toBeTruthy();
      expect(screen.getByText(/strictly capped at \$500,000/i)).toBeTruthy();
    });
  });
});
