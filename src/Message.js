import React, { Component } from 'react';

const openElement = /([^[]*)(?:\[(\d+):)?(.*)/;
const OPEN_ELEMENT = "[";
const CLOSE_ELEMENT = "]";

function parse(format) {
  const [ , text, idx, rest ] = openElement.exec(format);

  if (!text && !idx) {
    return null;
  }

  let content = '';

  let i = 0, count = 1, rl = rest.length;

  if (idx) {
    for (; count && i < rl; i++) {
      if (rest[i] === OPEN_ELEMENT) {
        count++;
      } else if (rest[i] === CLOSE_ELEMENT) {
        count--;
      }
    }
    // If count === 0, we've found the end of this element placeholder
    if (!count) {
      content = rest.slice(0, i - 1);
    } else {
      throw new Error("Unterminated element placeholder");
    }
  }

  return [ text, idx, content, rest.slice(i) ];
}

function* getChildren(format, children, expressions) {
  const placeholderRegex = /{[\w\d_]+}/g;

  let match = parse(format);
  while (match) {
    const [ text, idx, content, rest ] = match;

    if (text) {
      yield text.replace(
        placeholderRegex,
        p => expressions[p.slice(1, -1)]
      );
    }

    if (idx) {
      const child = children[idx - 1];

      if (!child) {
        throw new Error("Element index out of range");
      }

      yield React.cloneElement(
        child, null,
        ...getChildren(content, children, expressions)
      );
    }

    match = parse(rest);
  }
}

class Message extends Component {
  render() {
    const { format, component, expressions, children } = this.props;
    return React.cloneElement(
      component,
      null,
      ...getChildren(
        global.gettext(format),
        React.Children.toArray(children),
        expressions
      )
    );
  }
}

Message.propTypes = {
  format: React.PropTypes.string.isRequired
};

export default Message;
