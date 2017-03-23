import React, { Component } from 'react';
import "babel-polyfill";

const TEXT = Symbol("text");
const NUMBER = Symbol("number");
const OPEN_ELEMENT = Symbol("[");
const CLOSE_ELEMENT = Symbol("]");

function* tokenize(format) {
  const matcher = /((?:[^\[\]\\]|\\.)+)|(\[)(\d+):|(\])/g;

  let match;
  while (match = matcher.exec(format)) {
    const [ , text, openElement, index, closeElement ] = match;

    if (text) {
      yield { type: TEXT, value: text };
    } else if (openElement) {
      yield { type: OPEN_ELEMENT };
      yield { type: NUMBER, value: +index };
    } else if (closeElement) {
      yield { type: CLOSE_ELEMENT };
    }
  }
}

function parse(format) {
  let stack = [ { index: 0, children: [] } ];
  let tokenStream = tokenize(format);

  for (const { type, value } of tokenStream) {
    switch (type) {
      case TEXT:
        stack[stack.length - 1].children.push(value);
        break;

      case OPEN_ELEMENT: {
        const node = { index: null, children: [] };
        stack[stack.length - 1].children.push(node);
        stack.push(node);
        break;
      }

      case NUMBER:
        stack[stack.length - 1].index = value;
        break;

      case CLOSE_ELEMENT:
        stack.pop();
        break;

      default:
        throw new Exception(`Invalid token ${type}`);
    }
  }

  if (stack.length !== 1) {
    throw new Exception("Unmatched opening and closing elements");
  }

  return stack[0];
}

function format(str, expressions) {
  return str.
    replace(/{([\w\d_]+)}/g, (_, p1) => String(expressions[p1])).
    replace(/\\(.)/g, "$1");
}

function mapComponents({ index, children }, components, expressions) {
  return React.cloneElement(
    components[index],
    null,
    ...children.map(child => {
      if (typeof child === "string") {
        return format(child, expressions);
      } else {
        return mapComponents(child, components, expressions);
      }
    })
  );
}

class Message extends Component {
  render() {
    const { format, component, expressions, children, translator } = this.props;
    return mapComponents(
      parse(translator(format)),
      [ component, ...React.Children.toArray(children) ],
      expressions
    );
  }
}

Message.propTypes = {
  format: React.PropTypes.string.isRequired,
  translator: React.PropTypes.func.isRequired,
  component: React.PropTypes.element.isRequired,
  expressions: React.PropTypes.object
};

export default Message;
