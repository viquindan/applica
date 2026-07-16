import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import WebView, { type WebViewMessageEvent } from 'react-native-webview';

import { UnansweredSheet } from '@/components/unanswered-sheet';
import { buildInjectedScript } from './injected-script';
import { TurnBanner } from './turn-banner';

type Msg =
  | { type: 'started' | 'resumed' | 'no_easy_apply' | 'submitted' }
  | { type: 'checkpoint'; payload: { url: string } }
  | { type: 'progress'; payload: { step: string } }
  | { type: 'unanswered'; payload: { fields: string[] } }
  | { type: 'error'; payload: { message: string } };

type Props = {
  jobUrl: string;
  initialAnswers: Record<string, string>;
  onSubmitted: () => void;
  onNoEasyApply: () => void;
};

export function LinkedInWebView({ jobUrl, initialAnswers, onSubmitted, onNoEasyApply }: Props) {
  const webviewRef = useRef<WebView>(null);
  const [checkpoint, setCheckpoint] = useState(false);
  const [unanswered, setUnanswered] = useState<string[]>([]);
  const answersRef = useRef<Record<string, string>>(initialAnswers);

  function reinject(answers: Record<string, string>) {
    answersRef.current = answers;
    webviewRef.current?.injectJavaScript(buildInjectedScript(answers));
  }

  function onMessage(e: WebViewMessageEvent) {
    let msg: Msg;
    try {
      msg = JSON.parse(e.nativeEvent.data);
    } catch {
      return;
    }
    switch (msg.type) {
      case 'checkpoint':
        setCheckpoint(true);
        break;
      case 'resumed':
        setCheckpoint(false);
        break;
      case 'unanswered':
        setUnanswered(msg.payload.fields);
        break;
      case 'submitted':
        onSubmitted();
        break;
      case 'no_easy_apply':
        onNoEasyApply();
        break;
      case 'error':
        console.warn('[LinkedInWebView]', msg.payload.message);
        break;
      default:
        break;
    }
  }

  return (
    <View style={styles.container}>
      <TurnBanner visible={checkpoint} />
      <WebView
        ref={webviewRef}
        source={{ uri: jobUrl }}
        style={styles.webview}
        sharedCookiesEnabled
        onMessage={onMessage}
        onLoadEnd={() => reinject(answersRef.current)}
      />
      <UnansweredSheet
        fields={unanswered}
        onDismiss={() => setUnanswered([])}
        onSubmit={(answers) => {
          const merged = { ...answersRef.current, ...answers };
          setUnanswered([]);
          reinject(merged);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  webview: { flex: 1 },
});
