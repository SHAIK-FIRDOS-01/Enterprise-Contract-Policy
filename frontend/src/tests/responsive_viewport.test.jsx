import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import * as pdfjsLib from 'pdfjs-dist';
import api from '../services/api';
import * as streamingService from '../services/streaming';
import { transformCoordinates } from '../utils/coordinates';
import { AuthProvider } from '../context/AuthContext';
import WorkspacePage from '../pages/workspace/WorkspacePage';

// Mock pdfjs-dist
vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  version: '3.11.174',
  getDocument: vi.fn(),
}));

describe('Ticket 14-R: Responsive Web Layout, High-DPI Coordinate Normalization, and Adaptive Split-Pane', () => {
  const originalInnerWidth = window.innerWidth;
  const originalDevicePixelRatio = window.devicePixelRatio;

  beforeEach(() => {
    vi.restoreAllMocks();

    // Mock HTMLCanvasElement.getContext
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

    // Mock ResizeObserver
    window.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };

    // Setup pdfjs-dist mock
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
              cancel: vi.fn(),
            })),
          })
        ),
      }),
      destroy: vi.fn(),
    });
  });

  afterEach(() => {
    window.innerWidth = originalInnerWidth;
    window.devicePixelRatio = originalDevicePixelRatio;
    window.dispatchEvent(new Event('resize'));
  });

  // -------------------------------------------------------------------------
  // Test 1: Coordinate transformation remains invariant under DPR & container resize
  // -------------------------------------------------------------------------
  it('preserves coordinate transformation invariance under high-DPI scaling (dpr=2.0) and container resize', () => {
    const box = {
      norm_x0: 0.1,
      norm_y0: 0.15,
      norm_x1: 0.6,
      norm_y1: 0.45,
    };

    // Base layout dimensions: 800 x 1000 CSS pixels
    const layoutWidth = 800;
    const layoutHeight = 1000;

    // Simulate device pixel ratio 1.0 vs 2.0 (Retina display)
    window.devicePixelRatio = 1.0;
    const coordsStandard = transformCoordinates(box, layoutWidth, layoutHeight);

    window.devicePixelRatio = 2.0;
    const coordsRetina = transformCoordinates(box, layoutWidth, layoutHeight);

    // Invariant: CSS layout coordinates must be identical regardless of window.devicePixelRatio
    expect(coordsStandard.left).toBeCloseTo(80, 2);
    expect(coordsStandard.top).toBeCloseTo(150, 2);
    expect(coordsStandard.width).toBeCloseTo(400, 2);
    expect(coordsStandard.height).toBeCloseTo(300, 2);

    expect(coordsRetina.left).toBe(coordsStandard.left);
    expect(coordsRetina.top).toBe(coordsStandard.top);
    expect(coordsRetina.width).toBe(coordsStandard.width);
    expect(coordsRetina.height).toBe(coordsStandard.height);

    // Dynamic resize: container scales down to 400 x 500
    const coordsResized = transformCoordinates(box, 400, 500);
    expect(coordsResized.left).toBeCloseTo(40, 2);
    expect(coordsResized.top).toBeCloseTo(75, 2);
    expect(coordsResized.width).toBeCloseTo(200, 2);
    expect(coordsResized.height).toBeCloseTo(150, 2);

    // Edge cases: guard against 0 or negative dimensions
    expect(transformCoordinates(box, 0, 1000)).toEqual({ left: 0, top: 0, width: 0, height: 0 });
    expect(transformCoordinates(box, 800, 0)).toEqual({ left: 0, top: 0, width: 0, height: 0 });
    expect(transformCoordinates(null, 800, 1000)).toEqual({ left: 0, top: 0, width: 0, height: 0 });
  });

  // -------------------------------------------------------------------------
  // Test 2: Workspace segmented view-switcher renders and toggles panes below desktop breakpoint
  // -------------------------------------------------------------------------
  it('renders segmented view controls and toggles active pane when viewport is below desktop breakpoint', async () => {
    // Set viewport width to 900px (Tablet / Laptop < 1280px)
    window.innerWidth = 900;
    window.dispatchEvent(new Event('resize'));

    const mockDocs = [
      {
        id: 'doc-responsive-1',
        title: 'Master Service Agreement.pdf',
        file: 'https://storage.enterprise.internal/contracts/msa.pdf',
        status: 'READY',
        page_count: 3,
      },
    ];

    vi.spyOn(api, 'get').mockImplementation((url) => {
      if (url === '/api/documents/') {
        return Promise.resolve({ data: mockDocs });
      }
      if (url === '/api/documents/doc-responsive-1/chunks/') {
        return Promise.resolve({ data: [] });
      }
      if (url === '/api/auth/me/') {
        return Promise.resolve({
          data: { id: 'u1', email: 'auditor@enterprise.com', role: 'AUDITOR' },
        });
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });

    render(
      <BrowserRouter>
        <AuthProvider>
          <WorkspacePage />
        </AuthProvider>
      </BrowserRouter>
    );

    // On compact screens (< 1280px), segmented controls should be present
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /AUDIT COPILOT/i })).toBeTruthy();
      expect(screen.getByRole('button', { name: /CITATIONS/i })).toBeTruthy();
    });

    // Toggle to AUDIT COPILOT
    const copilotTabBtn = screen.getByRole('button', { name: /AUDIT COPILOT/i });
    fireEvent.click(copilotTabBtn);

    // Verify Copilot query input is visible
    expect(screen.getByPlaceholderText(/Ask compliance or legal questions/i)).toBeTruthy();

    // Toggle to CITATIONS tab
    const citationsTabBtn = screen.getByRole('button', { name: /CITATIONS/i });
    fireEvent.click(citationsTabBtn);

    // Verify Citations pane renders empty or citation list
    expect(screen.getByText(/No citations generated for this query/i)).toBeTruthy();

    // Toggle back to AUDIT COPILOT
    fireEvent.click(copilotTabBtn);
    expect(screen.getByPlaceholderText(/Ask compliance or legal questions/i)).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // Test 3: Citation selection on compact screens selects citation
  // -------------------------------------------------------------------------
  it('selects and activates citation when clicked on compact viewports', async () => {
    // Set compact screen width (768px)
    window.innerWidth = 768;
    window.dispatchEvent(new Event('resize'));

    const mockDocs = [
      {
        id: 'doc-responsive-2',
        title: 'Cloud Service Agreement.pdf',
        file: 'https://storage.enterprise.internal/contracts/csa.pdf',
        status: 'READY',
        page_count: 3,
      },
    ];

    vi.spyOn(api, 'get').mockImplementation((url) => {
      if (url === '/api/documents/') {
        return Promise.resolve({ data: mockDocs });
      }
      if (url === '/api/documents/doc-responsive-2/chunks/') {
        return Promise.resolve({ data: [] });
      }
      if (url === '/api/auth/me/') {
        return Promise.resolve({
          data: { id: 'u1', email: 'auditor@enterprise.com', role: 'AUDITOR' },
        });
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });

    vi.spyOn(streamingService, 'streamContractQuery').mockImplementation(
      async ({ onDelta, onVerification, onDone }) => {
        act(() => {
          onDelta('Liability is capped at $1,000,000 [Ref:1].');
          onVerification([
            {
              citation_index: 1,
              chunk_id: 'chunk-csa-01',
              page_number: 2,
              status: 'VERIFIED',
              confidence: 0.95,
              extracted_claim: 'Liability is capped at $1,000,000.',
              bounding_box: { norm_x0: 0.1, norm_y0: 0.2, norm_x1: 0.8, norm_y1: 0.4 },
            },
          ]);
          onDone({ total_chunks: 1 });
        });
      }
    );

    render(
      <BrowserRouter>
        <AuthProvider>
          <WorkspacePage />
        </AuthProvider>
      </BrowserRouter>
    );

    // Wait for document and controls
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /AUDIT COPILOT/i })).toBeTruthy();
    });

    // Switch to AUDIT COPILOT view
    const copilotTabBtn = screen.getByRole('button', { name: /AUDIT COPILOT/i });
    fireEvent.click(copilotTabBtn);

    // Submit a query
    const queryInput = screen.getByPlaceholderText(/Ask compliance or legal questions/i);
    const submitBtn = screen.getByRole('button', { name: /SUBMIT QUERY/i });
    fireEvent.change(queryInput, { target: { value: 'What is the liability cap?' } });
    fireEvent.click(submitBtn);

    // Citation badge [Ref: 1] appears
    const citationBadge = await screen.findByTestId('citation-badge-1');
    expect(citationBadge).toBeTruthy();

    // Click the citation badge while on COPILOT view
    fireEvent.click(citationBadge);

    // Invariant: The Grounded Source Card for Ref 1 is rendered and focused
    await waitFor(() => {
      const card = screen.getByTestId('grounded-source-card-1');
      expect(card).toBeTruthy();
      expect(card.className).toContain('border-emerald-500/70');
    });
  });

  // -------------------------------------------------------------------------
  // Test 4: Responsive navigation between Copilot and Citations tabs on compact viewports
  // -------------------------------------------------------------------------
  it('switches seamlessly between Copilot and Citations tabs on compact viewports', async () => {
    // Set compact screen width (800px)
    window.innerWidth = 800;
    window.dispatchEvent(new Event('resize'));

    const mockDocs = [
      {
        id: 'doc-responsive-3',
        title: 'Master Service Agreement.pdf',
        file: 'https://storage.enterprise.internal/contracts/msa.pdf',
        status: 'READY',
        page_count: 3,
      },
    ];

    vi.spyOn(api, 'get').mockImplementation((url) => {
      if (url === '/api/documents/') {
        return Promise.resolve({ data: mockDocs });
      }
      if (url === '/api/documents/doc-responsive-3/chunks/') {
        return Promise.resolve({ data: [] });
      }
      if (url === '/api/auth/me/') {
        return Promise.resolve({
          data: { id: 'u1', email: 'auditor@enterprise.com', role: 'AUDITOR' },
        });
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });

    render(
      <BrowserRouter>
        <AuthProvider>
          <WorkspacePage />
        </AuthProvider>
      </BrowserRouter>
    );

    // Initial state on compact screen: Segmented controls visible
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /AUDIT COPILOT/i })).toBeTruthy();
      expect(screen.getByRole('button', { name: /CITATIONS/i })).toBeTruthy();
    });

    // Verify Copilot query input is active
    expect(screen.getByPlaceholderText(/Ask compliance or legal questions/i)).toBeTruthy();

    // Switch to Citations tab
    const citationsTabBtn = screen.getByRole('button', { name: /CITATIONS/i });
    fireEvent.click(citationsTabBtn);

    await waitFor(() => {
      expect(citationsTabBtn.className).toContain('bg-zinc-800');
      expect(screen.getByText(/No citations generated for this query/i)).toBeTruthy();
    });

    // Switch back to Copilot tab
    const copilotTabBtn = screen.getByRole('button', { name: /AUDIT COPILOT/i });
    fireEvent.click(copilotTabBtn);

    await waitFor(() => {
      expect(copilotTabBtn.className).toContain('bg-zinc-800');
      expect(screen.getByPlaceholderText(/Ask compliance or legal questions/i)).toBeTruthy();
    });
  });
});

