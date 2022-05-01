import { Node, PropertyAssignment, ts, Type } from 'ts-morph';

import { inspect } from 'util';

export const helpers = {
  findCallExpressionFromChildren: (property: PropertyAssignment) => property.getChildren(),
  findCallExpression: (n: Node<ts.Node>[]) =>
    n.find((x) => x.getKind() === ts.SyntaxKind.CallExpression),
  findSyntaxList: (property: PropertyAssignment | Node<ts.Node>) =>
    property.getChildren().find((x) => x.getKind() === ts.SyntaxKind.SyntaxList),
  findFunction: (property: PropertyAssignment) =>
    property
      .getChildren()
      .find(
        (x) =>
          x.getKind() === ts.SyntaxKind.ArrowFunction ||
          x.getKind() === ts.SyntaxKind.FunctionExpression,
      ),
  findReturnStatement: (property: PropertyAssignment) =>
    property.getChildren().find((x) => x.getKind() === ts.SyntaxKind.ReturnStatement),
  findIdentifier: (property: PropertyAssignment) =>
    property.getChildren().find((x) => x.getKind() === ts.SyntaxKind.ReturnStatement),
  findObjectLiteralExpressionFromChildren: (property: PropertyAssignment) =>
    property.getChildren().find((x) => x.getKind() === ts.SyntaxKind.ObjectLiteralExpression),
  findObjectLiteralExpression: (n: Node<ts.Node>[]) =>
    n.find((x) => x.getKind() === ts.SyntaxKind.ObjectLiteralExpression),
  filterPropertyAssignmentFromChildren: (property: PropertyAssignment) =>
    property.getChildren().filter((x) => x.getKind() === ts.SyntaxKind.PropertyAssignment),
  findPropertyAssignmentFromChildren: (property: PropertyAssignment) =>
    property.getChildren().find((x) => x.getKind() === ts.SyntaxKind.PropertyAssignment),
  findPropertyAssignment: (n: Node<ts.Node>[]) =>
    n.find((x) => x.getKind() === ts.SyntaxKind.PropertyAssignment),
  findUnionTypeNodeFromChildren: (n: Node<ts.Node>) =>
    n.getChildren().find((x) => x.getKind() === ts.SyntaxKind.UnionType),
  findNullableTypeFromChildren: (n: Node<ts.Node>) =>
    n.getChildren().find((x) => isNullType(x.getType())),
  filterNullableTypeFromChildren: (n: Node<ts.Node>) =>
    n.getChildren().filter((x) => !isNullType(x.getType())),
  cleanNullableTypes: (t: Type<ts.Type>[]) => t.filter((x) => !isNullType(x)),
}; //Prop

export const isFinalType = (t: Type<ts.Type>) =>
  t.isNumber() || t.isString() || t.isBoolean() || t.isLiteral();

export const isNullType = (t: Type<ts.Type>) => t.isNull() || t.isUndefined();

type ResolvedBasicTypes = 'string' | 'number' | 'boolean' | 'array' | 'object';

export const isHandler = (c: Node<ts.Node>) => c.getSymbol()?.getName() === 'handler';
export const isRoute = (c: Node<ts.Node>) => c.getSymbol()?.getName() === 'route';

export const getTypeGenericText = (t: Type<ts.Type>) => {
  if (t.isStringLiteral() || t.isNumberLiteral() || t.isBooleanLiteral()) {
    return t.getBaseTypeOfLiteralType().getText() as ResolvedBasicTypes;
  } else {
    return t.getText() as ResolvedBasicTypes;
  }
};

export const getApparentTypeName = (t: Type<ts.Type>) => {
  return t.getApparentType().getText().toLowerCase();
};

export function logInternals(data: any) {
  console.log(inspect(data, false, null, true));
}
