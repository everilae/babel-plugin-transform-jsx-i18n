import React, { Component } from 'react';

function* parse(format, children, expressions) {
  const parserRegex = /([^[]*)(?:\[(\d+):([^\]]*)\])?/g;
  const placeholderRegex = /{[\w\d_]+}/g;
  let match = parserRegex.exec(format);

  while (match[0]) {
    const [ , text, idx, content ] = match;

    yield text.replace(
      placeholderRegex,
      p => expressions[p.slice(1, -1)]
    );

    if (idx) {
      yield React.cloneElement(
        children[idx - 1],
        null,
        ...parse(content, children, expressions)
      );
    }

    match = parserRegex.exec(format);
  }
}

class Message extends Component {
  render() {
    const { format, component, expressions, children } = this.props;
    return React.cloneElement(
      component,
      null,
      ...parse(
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
