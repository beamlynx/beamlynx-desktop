import { StreamLanguage } from '@codemirror/language';

interface PineLanguageState {
  // Simple state, no complex tracking needed
}

const pineLanguage = StreamLanguage.define<PineLanguageState>({
  name: 'pine',
  
  startState(): PineLanguageState {
    return {};
  },

  token(stream, state) {
    // Handle whitespace
    if (stream.eatSpace()) {
      return null;
    }

    // Check for operations first
    if (stream.match(/^(select|where|limit|from|order|group|delete|count|s|w|l|f|o|g|d)[:!]/i)) {
      // Try different standard CodeMirror token types:
      // 'keyword' - usually bold, theme-specific color
      // 'operator' - usually colorful, for operators
      // 'variableName' - for identifiers
      // 'typeName' - for types
      // 'propertyName' - for properties
      // 'string' - for strings
      // 'number' - for numbers
      return 'operator';
    }

    // Check for column hints: .columnName preceded by space
    // Note: whitespace is already consumed by eatSpace(), so check previous char
    if (stream.match(/^\.[A-Za-z][A-Za-z0-9\-_]*/) && 
        stream.start > 0 && 
        /\s/.test(stream.string.charAt(stream.start - 1))) {
      return 'propertyName';
    }

    // Skip everything else - no other highlighting
    stream.next();
    return null;
  },

  languageData: {
    commentTokens: { line: '//' },
  }
});

export { pineLanguage }; 