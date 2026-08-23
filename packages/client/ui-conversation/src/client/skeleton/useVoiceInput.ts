/**
 * Browser speech-to-text for the composer's mic control.
 *
 * A thin wrapper over the native Web Speech API, matching what the web product
 * does: recognition runs in the browser and streams interim plus final
 * transcripts back, so there is no audio endpoint to deploy and no recording
 * to store. A browser without the API reports `supported: false` and the
 * caller renders no mic rather than a control that cannot work.
 *
 * Only FINALIZED phrases reach `onFinal`. Interim text is exposed separately
 * for a live preview: appending it would make the draft rewrite itself as the
 * engine changes its mind mid-phrase.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

/** The slice of the vendor-prefixed API this hook uses. */
interface SpeechAlternative { transcript: string }
interface SpeechResult { isFinal: boolean; 0: SpeechAlternative; length: number }
interface SpeechResultList { length: number; [index: number]: SpeechResult }
interface SpeechResultEvent { resultIndex: number; results: SpeechResultList }
interface SpeechErrorEvent { error: string }

interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((event: SpeechResultEvent) => void) | null
  onerror: ((event: SpeechErrorEvent) => void) | null
  onend: (() => void) | null
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike

/** The API is still vendor-prefixed in Chromium and absent in Firefox. */
function recognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const scope = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null
}

/**
 * The tag the speech engine should recognise in.
 *
 * `<html lang>` already carries the active locale as a BCP 47 tag (the locale
 * runtime keeps it in step), so the two Chinese variants arrive usable. The
 * two that name only a language get the region the engine expects.
 */
function speechLanguage(): string {
  const tag = typeof document === 'undefined' ? '' : document.documentElement.lang
  if (tag === 'en' || tag === '') return 'en-US'
  if (tag === 'ja') return 'ja-JP'
  return tag
}

/** What the composer needs to drive and render a dictation session. */
export interface VoiceInput {
  /** Whether this browser can recognise speech at all. */
  supported: boolean
  /** Whether a session is currently open. */
  listening: boolean
  /** The phrase being recognised right now; empty between phrases. */
  interim: string
  /** The last error worth showing, or null. */
  error: string | null
  /** Open a session. A no-op while one is already open. */
  start: () => void
  /** Close the session; `onend` clears the state. */
  stop: () => void
}

/**
 * Drive one dictation session for the composer.
 * @param onFinal - receives each finalized phrase, already trimmed.
 * @returns the session state and its two controls.
 */
export function useVoiceInput(onFinal: (text: string) => void): VoiceInput {
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [error, setError] = useState<string | null>(null)
  const recognition = useRef<SpeechRecognitionLike | null>(null)
  // Held in a ref so a re-render never rebuilds a live recognizer.
  const latestOnFinal = useRef(onFinal)
  latestOnFinal.current = onFinal

  const stop = useCallback((): void => {
    recognition.current?.stop()
  }, [])

  const start = useCallback((): void => {
    const Ctor = recognitionCtor()
    if (Ctor === null || recognition.current !== null) return
    setError(null)
    const session = new Ctor()
    session.lang = speechLanguage()
    session.continuous = true
    session.interimResults = true
    session.onresult = (event) => {
      let live = ''
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i]
        if (result === undefined) continue
        const text = result[0].transcript
        if (result.isFinal) {
          const phrase = text.trim()
          if (phrase !== '') latestOnFinal.current(phrase)
        } else {
          live += text
        }
      }
      setInterim(live)
    }
    session.onerror = (event) => {
      // A pause and a deliberate stop both surface as errors; neither is one.
      if (event.error !== 'no-speech' && event.error !== 'aborted') setError(event.error)
    }
    session.onend = () => {
      recognition.current = null
      setListening(false)
      setInterim('')
    }
    recognition.current = session
    try {
      session.start()
      setListening(true)
    } catch (cause) {
      // start() throws when a session is already running in another tab.
      recognition.current = null
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }, [])

  // A live recognizer outlives its component otherwise, holding the mic open.
  useEffect(() => () => { recognition.current?.abort() }, [])

  return {
    supported: recognitionCtor() !== null,
    listening,
    interim,
    error,
    start,
    stop,
  }
}
