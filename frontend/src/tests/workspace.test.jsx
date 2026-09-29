import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CitationBadge from '../components/workspace/CitationBadge';
import AuditQueryInput from '../components/workspace/AuditQueryInput';

describe('Ticket 11: Real-Time SSE Audit Copilot Workspace Suite', () => {
  // Test 1: CitationBadge confidence styling
  describe('CitationBadge', () => {
    it('renders correct confidence styling: emerald for HIGH, amber for MEDIUM, rose for REJECTED', () => {
      const handleClick = vi.fn();

      // 1. HIGH / VERIFIED confidence (>= 0.75)
      const { rerender } = render(
        <CitationBadge
          citationIndex={1}
          status="VERIFIED"
          confidence={0.92}
          pageNumber={2}
          onClick={handleClick}
        />
      );

      const highBadge = screen.getByTestId('citation-badge-1');
      expect(highBadge.className).toContain('text-emerald-400');
      expect(screen.getByText(/Ref: 1/i)).toBeTruthy();

      // Click event
      fireEvent.click(highBadge);
      expect(handleClick).toHaveBeenCalledWith(
        expect.objectContaining({ citationIndex: 1, pageNumber: 2 })
      );

      // 2. MEDIUM / CAUTION confidence (0.50 - 0.74)
      rerender(
        <CitationBadge
          citationIndex={2}
          status="LOW"
          confidence={0.65}
          pageNumber={4}
          onClick={handleClick}
        />
      );

      const medBadge = screen.getByTestId('citation-badge-2');
      expect(medBadge.className).toContain('text-amber-400');

      // 3. REJECTED / HALLUCINATED (< 0.50)
      rerender(
        <CitationBadge
          citationIndex={3}
          status="REJECTED"
          confidence={0.32}
          pageNumber={1}
          onClick={handleClick}
        />
      );

      const rejectedBadge = screen.getByTestId('citation-badge-3');
      expect(rejectedBadge.className).toContain('text-rose-400');
      expect(rejectedBadge.className).toContain('line-through');
    });
  });

  // Test 2: AuditQueryInput submission controls and keyboard events
  describe('AuditQueryInput', () => {
    it('disables submission when empty or while streaming, and triggers query on Enter', () => {
      const handleSubmit = vi.fn();
      const handleCancel = vi.fn();
      const handleQueryChange = vi.fn();

      const { rerender } = render(
        <AuditQueryInput
          query=""
          onQueryChange={handleQueryChange}
          onSubmit={handleSubmit}
          isStreaming={false}
          onCancel={handleCancel}
        />
      );

      const submitBtn = screen.getByRole('button', { name: /SUBMIT QUERY/i });
      expect(submitBtn.disabled).toBe(true);

      // Rerender with non-empty query
      rerender(
        <AuditQueryInput
          query="What is the maximum liability cap?"
          onQueryChange={handleQueryChange}
          onSubmit={handleSubmit}
          isStreaming={false}
          onCancel={handleCancel}
        />
      );

      expect(submitBtn.disabled).toBe(false);

      // Keypress Enter triggers submit
      const textarea = screen.getByPlaceholderText(/Ask compliance or legal questions/i);
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });
      expect(handleSubmit).toHaveBeenCalledTimes(1);

      // Shift + Enter should NOT trigger submit (creates newline)
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });
      expect(handleSubmit).toHaveBeenCalledTimes(1);

      // While streaming, submit button becomes STOP button or is replaced
      rerender(
        <AuditQueryInput
          query="What is the maximum liability cap?"
          onQueryChange={handleQueryChange}
          onSubmit={handleSubmit}
          isStreaming={true}
          onCancel={handleCancel}
        />
      );

      const stopBtn = screen.getByRole('button', { name: /HALT STREAM/i });
      expect(stopBtn).toBeTruthy();
      fireEvent.click(stopBtn);
      expect(handleCancel).toHaveBeenCalledTimes(1);
    });
  });

  // Test 3: Citation click handler dispatches target page and active bounding box ID
  describe('Citation Synchronization', () => {
    it('dispatches target page and active bounding box ID on badge selection', () => {
      const handleSync = vi.fn();

      render(
        <CitationBadge
          citationIndex={5}
          status="VERIFIED"
          confidence={0.88}
          pageNumber={7}
          chunkId="chunk-uuid-777"
          onClick={handleSync}
        />
      );

      const badge = screen.getByTestId('citation-badge-5');
      fireEvent.click(badge);

      expect(handleSync).toHaveBeenCalledWith({
        citationIndex: 5,
        status: 'VERIFIED',
        confidence: 0.88,
        pageNumber: 7,
        chunkId: 'chunk-uuid-777',
      });
    });
  });
});
