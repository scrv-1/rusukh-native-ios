import React from 'react';
import { AppState } from 'react-native';
import { render, screen, act, fireEvent } from '@testing-library/react-native';
import { LocalAILab } from '../src/ai/LocalAILab';
import { AI_PROTOCOL, parseDraft } from '../src/ai/contracts';

const mockInject = jest.fn();
jest.mock('../src/ai/engine.generated', () => ({ LOCAL_AI_HTML: '<html>test bridge fixture; no inference claimed</html>' }));
jest.mock('react-native-webview', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { WebView: React.forwardRef((props, ref) => {
    React.useImperativeHandle(ref, () => ({ injectJavaScript: mockInject }));
    return <View {...props} testID="local-ai-webview" />;
  }) };
});
const source = 'المراجعة المتباعدة توزع جلسات المراجعة على فترات زمنية وتساعد على استرجاع المعلومات.';
const draft = () => parseDraft(JSON.stringify({ questions: [{ question: 'كيف تكون المراجعة المتباعدة؟', answer: 'بتوزيع جلسات المراجعة.', evidence: 'توزع جلسات المراجعة على فترات زمنية' }] }), source, 'test.gguf');
const message = (type, payload, requestId = '1') => ({ nativeEvent: { data: JSON.stringify({ protocol: AI_PROTOCOL, requestId, type, payload }) } });

test('a queued valid result cannot publish after the native WebView fails', async () => {
  const onResult = jest.fn(), onStatus = jest.fn();
  await render(<LocalAILab sourceText={source} onResult={onResult} onStatus={onStatus} />);
  const view = screen.getByTestId('local-ai-webview');
  const receive = view.props.onMessage;
  await fireEvent(view, 'message', message('ready', {}));
  await act(async () => view.props.onError());
  await act(async () => receive(message('result', draft())));
  expect(onResult).not.toHaveBeenCalled();
  expect(onStatus).toHaveBeenCalledWith(expect.objectContaining({ phase: 'error' }));
  expect(screen.queryByTestId('local-ai-webview')).toBeNull();
});

test('a source change invalidates a queued result for the old request', async () => {
  const onResult = jest.fn();
  await render(<LocalAILab sourceText={source} onResult={onResult} />);
  await fireEvent(screen.getByTestId('local-ai-webview'), 'message', message('ready', {}));
  const receive = screen.getByTestId('local-ai-webview').props.onMessage;
  await screen.rerender(<LocalAILab sourceText={source + ' مصدر جديد'} onResult={onResult} />);
  await act(async () => receive(message('result', draft())));
  expect(onResult).not.toHaveBeenCalled();
});

test('an unmounted laboratory cannot publish a queued result', async () => {
  const onResult = jest.fn();
  await render(<LocalAILab sourceText={source} onResult={onResult} />);
  const receive = screen.getByTestId('local-ai-webview').props.onMessage;
  await screen.unmount();
  await act(async () => receive(message('result', draft())));
  expect(onResult).not.toHaveBeenCalled();
});

test('moving to the background invalidates an already queued draft', async () => {
  let changeState;
  const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation((_name, listener) => { changeState = listener; return { remove: jest.fn() }; });
  try {
    const onResult = jest.fn();
    await render(<LocalAILab sourceText={source} onResult={onResult} />);
    const receive = screen.getByTestId('local-ai-webview').props.onMessage;
    await fireEvent(screen.getByTestId('local-ai-webview'), 'message', message('ready', {}));
    await act(async () => changeState('background'));
    await act(async () => receive(message('result', draft())));
    expect(onResult).not.toHaveBeenCalled();
  } finally { spy.mockRestore(); }
});
