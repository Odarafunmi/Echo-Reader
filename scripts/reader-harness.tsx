// Bundled by check-reader.mjs: renders the reader's chapter text in Node, so the
// word-wrapping and page separators can be inspected without a browser.
export { renderToStaticMarkup } from 'react-dom/server';
export { default as ChapterText } from '../components/ChapterText';
export { buildChapterAudio } from '../lib/audio/text';
