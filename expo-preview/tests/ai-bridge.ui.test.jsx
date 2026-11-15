import React from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { render, screen, act, fireEvent } from '@testing-library/react-native';
import { LocalAILab } from '../src/ai/LocalAILab';
import { AI_PROTOCOL, parseDraft } from '../src/ai/contracts';
import { dark, light } from '../src/ui';

const mockInject = jest.fn();
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
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
function contrast(foreground, background) {
  const luminance = hex => {
    let rgb = hex.slice(1);
    if (rgb.length === 3) rgb = rgb.split('').map(char => char + char).join('');
    const channels = [0, 2, 4].map(offset => parseInt(rgb.slice(offset, offset + 2), 16) / 255)
      .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  const values = [luminance(foreground), luminance(background)].sort((a, b) => a - b);
  return (values[1] + 0.05) / (values[0] + 0.05);
}
beforeEach(() => { jest.spyOn(AppState, 'addEventListener').mockImplementation(() => ({ remove: jest.fn() })); });
afterEach(() => { jest.restoreAllMocks(); });

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

test('a completed preview is validated and handed to recovery before explicit study adoption', async () => {
  const onResult=jest.fn();await render(<LocalAILab sourceText={source} onResult={onResult}/>);
  const completed=draft();
  await fireEvent(screen.getByTestId('local-ai-webview'),'message',message('draft',completed));
  expect(onResult).toHaveBeenCalledWith(completed);
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

test('the laboratory error declares a readable surface inside a dark parent', async () => {
  await render(<View style={{ backgroundColor: '#181819' }}><LocalAILab sourceText={source} onResult={jest.fn()} /></View>);
  await act(async () => screen.getByTestId('local-ai-webview').props.onError());
  const alert = screen.getByRole('alert');
  expect(StyleSheet.flatten(alert.parent.props.style).backgroundColor).toBe('#111');
  expect(StyleSheet.flatten(alert.props.style).color).toBe('#FF8989');
  expect(contrast(StyleSheet.flatten(alert.props.style).color, StyleSheet.flatten(alert.parent.props.style).backgroundColor)).toBeGreaterThanOrEqual(4.5);
  expect(alert).toHaveTextContent(/أغلق المختبر وافتحه للمحاولة مجددًا\./);
});

test.each([
  ['light', light],
  ['dark', dark],
])('the %s app palette supplies both colors of a terminated-engine error', async (_theme, p) => {
  await render(<View style={{ backgroundColor: p.surface }}><LocalAILab p={p} sourceText={source} onResult={jest.fn()} /></View>);
  await act(async () => screen.getByTestId('local-ai-webview').props.onContentProcessDidTerminate());
  const alert = screen.getByRole('alert');
  expect(StyleSheet.flatten(alert.parent.props.style).backgroundColor).toBe(p.surface);
  expect(StyleSheet.flatten(alert.props.style).color).toBe(p.danger);
  expect(contrast(StyleSheet.flatten(alert.props.style).color, StyleSheet.flatten(alert.parent.props.style).backgroundColor)).toBeGreaterThanOrEqual(4.5);
  expect(alert).toHaveTextContent(/أوقف النظام المحرك المحلي/);
  expect(screen.queryByTestId('local-ai-webview')).toBeNull();
});
