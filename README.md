# babel-plugin-transform-jsx-localize
Localize JSX as is.

## React

### In

```javascript
var element = <div>
  This is a message that should and could be localized.
</div>;
```

### Out

```javascript
var element = React.createElement("div", null,
  '\n  ' + gettext('This is a message that should and could be localized.') + '\n'
);
```
