# babel-plugin-transform-jsx-localize
Localize JSX as is.

## React

### In

```javascript
var simple = <p>Hello, World!</p>;

var placeholders = <p i18nMsg="name">Hello, { "World" }!</p>;

var elements = <div i18nMsg="">
  Text content should be <strong>translated</strong>.
  <img src="/img/hello.jpg" alt="Text props should be translated" />
</div>;
```

### Out

```javascript
var simple = React.createElement("p", null, gettext("Hello, World!"));

var placeholders = React.createElement(
  Message,
  {
    format: "Hello, {name}!",
    component: React.createElement("p", null),
    expressions: {
      name: "World"
    }
  }
);

var element = React.createElement(
  Message,
  {
    format: "\n  Text content should be [1:translated].\n  [2:]",
    component: React.createElement("div", null),
    expressions: {}
  },
  React.createElement("strong", null),
  React.createElement("img", { src: "/img/hello.jpg", alt: gettext("Text props should be translated") })
);
```
