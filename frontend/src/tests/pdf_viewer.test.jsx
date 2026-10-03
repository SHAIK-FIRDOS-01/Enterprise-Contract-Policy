import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { transformCoordinates } from '../utils/coordinates';
import ViewerControls from '../components/viewer/ViewerControls';
import DocumentUploadModal from '../components/contracts/DocumentUploadModal';

describe('Ticket 10: PDF Viewer & Document Management Suite', () => {
  // Test 1: Coordinate transformation utility
  describe('transformCoordinates', () => {
    it('correctly scales normalized [0, 1] bounding box coordinates to canvas pixel space', () => {
      const normalizedBox = {
        x0: 0.1,
        y0: 0.2,
        x1: 0.6,
        y1: 0.5,
      };
      const canvasWidth = 800;
      const canvasHeight = 1000;

      const pixelCoords = transformCoordinates(normalizedBox, canvasWidth, canvasHeight);

      expect(pixelCoords.left).toBeCloseTo(80, 1);
      expect(pixelCoords.top).toBeCloseTo(200, 1);
      expect(pixelCoords.width).toBeCloseTo(400, 1);
      expect(pixelCoords.height).toBeCloseTo(300, 1);
    });

    it('correctly handles point-based coordinates with original page dimensions', () => {
      const pointBox = {
        x0: 61.2,
        y0: 79.2,
        x1: 306.0,
        y1: 158.4,
      };
      const originalPage = { width: 612, height: 792 };
      const currentCanvasWidth = 1224;
      const currentCanvasHeight = 1584;

      const pixelCoords = transformCoordinates(
        pointBox,
        currentCanvasWidth,
        currentCanvasHeight,
        originalPage
      );

      expect(pixelCoords.left).toBeCloseTo(122.4, 1);
      expect(pixelCoords.top).toBeCloseTo(158.4, 1);
      expect(pixelCoords.width).toBeCloseTo(489.6, 1);
      expect(pixelCoords.height).toBeCloseTo(158.4, 1);
    });
  });

  // Test 2: ViewerControls UI and boundary states
  describe('ViewerControls', () => {
    it('renders page count, dispatches page changes, and enforces boundary states', () => {
      const handlePageChange = vi.fn();
      const handleZoomChange = vi.fn();
      const handleToggleHighlights = vi.fn();

      const { rerender } = render(
        <ViewerControls
          pageNumber={1}
          numPages={5}
          scale={1.0}
          onPageChange={handlePageChange}
          onZoomChange={handleZoomChange}
          showHighlights={true}
          onToggleHighlights={handleToggleHighlights}
        />
      );

      // Verify page count text
      expect(screen.getByLabelText('Page 1 of 5')).toBeTruthy();

      // Prev button should be disabled on page 1
      const prevBtn = screen.getByLabelText(/Previous Page/i);
      const nextBtn = screen.getByLabelText(/Next Page/i);

      expect(prevBtn.disabled).toBe(true);
      expect(nextBtn.disabled).toBe(false);

      // Click next page
      fireEvent.click(nextBtn);
      expect(handlePageChange).toHaveBeenCalledWith(2);

      // Re-render at boundary (last page)
      rerender(
        <ViewerControls
          pageNumber={5}
          numPages={5}
          scale={1.0}
          onPageChange={handlePageChange}
          onZoomChange={handleZoomChange}
          showHighlights={true}
          onToggleHighlights={handleToggleHighlights}
        />
      );

      const nextBtnAtEnd = screen.getByLabelText(/Next Page/i);
      expect(nextBtnAtEnd.disabled).toBe(true);
    });
  });

  // Test 3: DocumentUploadModal validation
  describe('DocumentUploadModal', () => {
    it('validates file type (rejects non-PDF) and enforces 25MB ceiling', () => {
      const handleClose = vi.fn();
      const handleSuccess = vi.fn();

      render(
        <DocumentUploadModal
          isOpen={true}
          onClose={handleClose}
          onUploadSuccess={handleSuccess}
        />
      );

      const fileInput = screen.getByTestId('file-drop-input');

      // 1. Non-PDF file rejection
      const invalidFile = new File(['mock content'], 'contract.png', {
        type: 'image/png',
      });
      fireEvent.change(fileInput, { target: { files: [invalidFile] } });

      expect(screen.getByText(/Only PDF documents/i)).toBeTruthy();

      // 2. Oversized PDF file rejection (> 25MB)
      const oversizedFile = new File(['x'.repeat(100)], 'large_contract.pdf', {
        type: 'application/pdf',
      });
      Object.defineProperty(oversizedFile, 'size', {
        value: 26 * 1024 * 1024,
      });

      fireEvent.change(fileInput, { target: { files: [oversizedFile] } });
      expect(screen.getByText(/File exceeds 25MB maximum limit/i)).toBeTruthy();
    });

    it('supports selecting and batch uploading multiple PDF files at once (e.g. 8 PDFs)', () => {
      const handleClose = vi.fn();
      const handleSuccess = vi.fn();

      render(
        <DocumentUploadModal
          isOpen={true}
          onClose={handleClose}
          onUploadSuccess={handleSuccess}
        />
      );

      const fileInput = screen.getByTestId('file-drop-input');

      // Select 8 valid PDF files
      const mockFiles = Array.from({ length: 8 }, (_, i) =>
        new File([`PDF test content ${i}`], `contract_${i + 1}.pdf`, {
          type: 'application/pdf',
        })
      );

      fireEvent.change(fileInput, { target: { files: mockFiles } });

      // Verify that all 8 documents are queued
      expect(screen.getByTestId('queued-counter').textContent).toMatch(/8 CONTRACTS QUEUED/i);
      expect(screen.getByText('contract_1.pdf')).toBeTruthy();
      expect(screen.getByText('contract_8.pdf')).toBeTruthy();
      expect(screen.getByRole('button', { name: /INGEST 8 CONTRACTS/i })).toBeTruthy();
    });
  });
});
