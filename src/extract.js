#!/usr/bin/env node
import traverse from "babel-traverse";
import * as babylon from "babylon";
import * as t from "babel-types";
import * as fs from "fs";
import * as u from "./utils";
import * as c from "./common";
import LocalizerError from "./LocalizerError";
import * as gettextParser from "gettext-parser";

function textToMessage(text) {
  return text.trim().replace(/\s+/g, " ");
}

function extractMessages(node) {
  return node.children.
    filter(u.isTranslatableText).
    map(child => textToMessage(child.value));
}

function extractFormat(node) {
  const {
    msg: i18nAttribute,
    comment
  } = u.getI18nAttributes(node.openingElement.attributes);

  const placeholders = u.asList(i18nAttribute.value);

  // FIXME: Make whitespace normalization configurable
  const { format } = u.extract(node, placeholders, true);

  return { format, comment: comment && comment.value.value };
}

function makeMessage(path, message, fileName, comment) {
  let msg = {
    msgid: message,
    msgstr: [],
    comments: {
      reference: `${fileName}:${path.node.loc.start.line}`
    }
  }

  if (comment) {
    msg.comments.extracted = comment;
  }

  return msg;
}

function jSXElement(path, fileName, catalog) {
  const { node } = path;

  if (u.isBlacklisted(path) || u.hasLang(path)) {
    path.skip();
    return;
  }

  try {
    if (u.hasAttribute(node, c.I18N_MSG_ATTRIBUTE)) {
      const { format, comment } = extractFormat(node);
      catalog[format] = makeMessage(path, format, fileName, comment);
      // This keeps possible children from being processed.
      path.skip();
    }
    else if (u.hasTranslatableText(node)) {
      extractMessages(node).
        forEach(msg => catalog[msg] = makeMessage(path, msg, fileName));
    }
  } catch (error) {
    if (error instanceof LocalizerError) {
      throw path.buildCodeFrameError(error.message);
    } else {
      // Rethrow
      throw error;
    }
  }
}

function jSXAttribute(path, fileName, catalog) {
  const { node } = path;
  if (!u.hasLang(path) && u.isTranslatableAttribute(node)) {
    const msg = textToMessage(node.value.value);
    catalog[msg] = makeMessage(path, msg, fileName);
  }
}

function visitor(fileName, catalog) {
  return {
    enter(path) {
      if (path.isJSXElement()) {
        jSXElement(path, fileName, catalog);
      } else if (path.isJSXAttribute()) {
        jSXAttribute(path, fileName, catalog);
      }
    }
  };
}

function parseAndExtract([ fileName, source ]) {
  const ast = babylon.parse(source, {
    sourceType: "module",
    plugins: [ "jsx" ]
  });
  let catalog = {}
  traverse(ast, visitor(fileName, catalog));
  return catalog;
}

function makeTranslationObject(catalog) {
  return {
    charset: "utf-8",
    headers: {
      "POT-Creation-Date": (new Date()).toISOString()
    },
    translations: {
      "": catalog
    }
  };
}

function main(encoding="utf-8") {
  const readFile = u.promisify(fs.readFile);
  const fileNames = process.argv.slice(
    process.argv[0].endsWith("node") ? 2 : 1);

  let sources = fileNames.
    map(fileName => readFile(fileName, encoding).
      then(source => [fileName, source]));

  Promise.all(sources).
    then(sources => {
      const catalogs = sources.map(parseAndExtract);
      const catalog = Object.assign(...catalogs);
      const translationObj = makeTranslationObject(catalog);
      const po = gettextParser.po.compile(translationObj);
      process.stdout.write(po);
      process.stdout.write("\n");
    });
}

if (require.main === module) {
  main();
}
