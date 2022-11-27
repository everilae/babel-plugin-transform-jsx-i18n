import * as t from "@babel/types";
import * as c from "./common";
import LocalizerError from "./LocalizerError";

export function any(iterable, pred) {
  for (const it of iterable) {
    if (pred(it)) {
      return true;
    }
  }

  return false;
}

export function add(x, y, ...rest) {
  return rest.reduce(
    (left, right) => t.binaryExpression('+', left, right),
    t.binaryExpression('+', x, y));
}

export function isBlacklisted(path) {
  return Boolean(
    path.find(path => path.isJSXElement() &&
      t.isJSXIdentifier(path.node.openingElement.name) &&
      c.ELEMENT_TYPE_BLACKLIST.includes(path.node.openingElement.name.name))
  );
}

export function hasLang(path) {
  return Boolean(
    path.find(path => {
      if (!path.isJSXElement()) {
        return false;
      }

      return any(
        path.node.openingElement.attributes,
        attribute => t.isJSXAttribute(attribute) &&
          t.isJSXIdentifier(attribute.name) &&
          attribute.name.name === c.LANG_ATTRIBUTE
      );
    })
  );
}

export function isTranslatableText(node) {
  return t.isJSXText(node) && node.value.trim();
}

export function isTranslatableAttribute(attr) {
  return c.TRANSLATABLE_ATTRIBUTES.includes(attr.name.name) &&
    t.isStringLiteral(attr.value) &&
    attr.value.value.trim();
}

export function hasAttribute(node, name) {
  return any(
    node.openingElement.attributes,
    attribute => (
      t.isJSXAttribute(attribute) &&
      t.isJSXIdentifier(attribute.name) &&
      attribute.name.name === name
    )
  );
}

export function getI18nAttributes(attributes) {
  return attributes.reduce(
    (acc, attr) => {
      if (attr.name.name === c.I18N_MSG_ATTRIBUTE) {
        acc.msg = attr;
      } else if (attr.name.name === c.I18N_COMMENT_ATTRIBUTE) {
        acc.comment = attr;
      } else {
        acc.rest.push(attr);
      }
      return acc;
    },
    { msg: null, comment: null, rest: [] }
  );
}

export function hasTranslatableText(node) {
  for (const child of node.children) {
    if (isTranslatableText(child)) {
      return true;
    }
  }

  return false;
}

export function stripElement(node, attributes=null) {
  return t.jSXElement(
    t.jSXOpeningElement(
      node.openingElement.name,
      attributes || node.openingElement.attributes,
      true
    ),
    null, [], true
  );
}

export function getMessageId(text, normalizeWs) {
  let [ , leadingWs, messageId, trailingWs ] =
    /^(\s*)((?:.|\s)+?)(\s*)$/.exec(text);

  if (normalizeWs) {
    leadingWs = leadingWs && " ";
    trailingWs = trailingWs && " ";
    messageId = messageId.replace(/\s+/g, " ");
  }

  return { leadingWs, messageId, trailingWs }
}

function extract(node, placeholders, normalizeWs, elements, expressions) {
  let format = "";

  for (const child of node.children) {
    if (t.isJSXText(child)) {
      format += child.value.replace(/([[\]\\])/g, "\\$1");
    }
    else if (t.isJSXElement(child)) {
      const idx = elements.length + 1;
      elements.push(stripElement(child));
      const fmt = extract(child, placeholders, normalizeWs, elements,
                          expressions).format;
      format += `[${idx}:${fmt}]`;
    }
    else if (t.isJSXExpressionContainer(child)) {
      const p = placeholders[expressions.length];
      expressions.push(child);
      format += `{${p}}`;
    }
  }

  return { format, elements, expressions };
}

export function extractMessage(node, placeholders, normalizeWs) {
  const { format, elements, expressions } =
    extract(node, placeholders, normalizeWs, [], []);

  // FIXME: Will cause trouble in <pre>, fix later.
  const { leadingWs, messageId, trailingWs } =
    getMessageId(format, normalizeWs);

  return {
    format: messageId,
    leadingWs,
    trailingWs,
    elements,
    expressions
  };
}

export function asList(node, path) {
  if (t.isStringLiteral(node)) {
    return node.value.trim() ? node.value.trim().split(/\s*,\s*/g) : [];
  } else if (t.isJSXExpressionContainer(node) &&
      t.isArrayExpression(node.expression)) {
    // array of string literals expected
    return node.expression.elements.map(expr => expr.value);
  } else {
    throw new LocalizerError("i18nMsg attribute must be string or array of string");
  }
}

export function jSXAttribute(identifier, value) {
  return t.jSXAttribute(
    t.jSXIdentifier(identifier),
    typeof value === "string" ? t.stringLiteral(value) : t.jSXExpressionContainer(value)
  );
}

export function promisify(fun) {
  return (...args) => {
    return new Promise((resolve, reject) => {
      fun(...args, (err, data) => {
        if (err) {
          reject(err);
        } else {
          resolve(data);
        }
      });
    });
  };
}
