import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react-native';
import { PdfTextExtractor } from '../src/pdf/PdfTextExtractor';

const mockInject = jest.fn();
const mockStop = jest.fn();
jest.mock('react-native-webview', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { WebView: React.forwardRef((props, ref) => {
    React.useImperativeHandle(ref, () => ({ injectJavaScript: mockInject, stopLoading: mockStop }));
    return <View {...props} testID="pdf-engine" />;
  }) };
});
const request = { id: 'job-1', filename: 'محاضرة.pdf', base64: 'JVBERi0xLjc=' };
const message = value => ({ nativeEvent: { data: JSON.stringify(value) } });

test('local engine starts once, blocks remote navigation and returns page-aware text', async () => {
  const onExtract = jest.fn(), onError = jest.fn();
  await render(<PdfTextExtractor request={request} onExtract={onExtract} onError={onError} />);
  const engine = screen.getByTestId('pdf-engine', { includeHiddenElements: true });
  expect(engine.props.source.html).toContain("connect-src 'none'");
  expect(engine.props.onShouldStartLoadWithRequest({ url: 'https://example.com' })).toBe(false);
  await fireEvent(engine, 'message', message({ type: 'ready' }));
  await fireEvent(engine, 'message', message({ type: 'ready' }));
  expect(mockInject).toHaveBeenCalledTimes(1);
  await fireEvent(engine, 'message', message({ id: request.id, type: 'result', payload: { pageCount: 1, pages: [{ pageNumber: 1, text: 'المعرفة' }] } }));
  expect(onExtract).toHaveBeenCalledWith(expect.objectContaining({ status: 'text', pageCount: 1, body: expect.stringContaining('[صفحة 1]') }));
  expect(onError).not.toHaveBeenCalled();
  expect(screen.queryByTestId('pdf-engine', { includeHiddenElements: true })).toBeNull();
});

test('cancelled job cannot publish a late result', async () => {
  const onExtract = jest.fn(), onError = jest.fn();
  await render(<PdfTextExtractor request={request} onExtract={onExtract} onError={onError} />);
  const receive = screen.getByTestId('pdf-engine', { includeHiddenElements: true }).props.onMessage;
  await screen.unmount();
  await act(async () => receive(message({ id: request.id, type: 'result', payload: { pageCount: 1, pages: [{ pageNumber: 1, text: 'late' }] } })));
  expect(onExtract).not.toHaveBeenCalled(); expect(onError).not.toHaveBeenCalled();
});

test('new job has a fresh engine and ignores a previous job ID', async () => {
  const onExtract = jest.fn(), onError = jest.fn();
  await render(<PdfTextExtractor request={request} onExtract={onExtract} onError={onError} />);
  await fireEvent(screen.getByTestId('pdf-engine', { includeHiddenElements: true }), 'message', message({ type: 'ready' }));
  await screen.rerender(<PdfTextExtractor request={{ ...request, id: 'job-2' }} onExtract={onExtract} onError={onError} />);
  await fireEvent(screen.getByTestId('pdf-engine', { includeHiddenElements: true }), 'message', message({ type: 'ready' }));
  expect(mockInject).toHaveBeenCalledTimes(2);
  await fireEvent(screen.getByTestId('pdf-engine', { includeHiddenElements: true }), 'message', message({ id: 'job-1', type: 'result', payload: { pageCount: 1, pages: [{ pageNumber: 1, text: 'stale' }] } }));
  expect(onExtract).not.toHaveBeenCalled();
});

test('deadline removes the engine and reports timeout rather than hanging forever', async () => {
  jest.useFakeTimers();
  try {
    const onError = jest.fn();
    await render(<PdfTextExtractor request={request} onExtract={jest.fn()} onError={onError} />);
    await act(async () => jest.advanceTimersByTime(30001));
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'TIMEOUT' }));
    expect(screen.queryByTestId('pdf-engine', { includeHiddenElements: true })).toBeNull();
    await screen.unmount();
  } finally { jest.useRealTimers(); }
});
