// import { createProjectSync, ts } from '@ts-morph/bootstrap';
import {
  ClassMemberTypes,
  Node,
  Project,
  PropertyAssignment,
  SyntaxList,
  ts,
  Type,
} from 'ts-morph';
import find from 'lodash/find';

import util from 'util';

export function logInternals(data: any) {
  // console.log({ data });
  console.log(util.inspect(data, false, null, true));
}

const project = new Project({ tsConfigFilePath: 'tsconfig.json' });
project.enableLogging();

const sourceFile = project.getSourceFile('server.ts');

const tp = sourceFile?.getClass('BareServer')?.getMember('route');

const h = {
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
}; //PropertyAssignment

const pipe = <T extends (...args: any[]) => any>(init, ...args: T[]) => {
  let sol = init;
  for (const fn of args) {
    sol = fn(sol);
  }
  return sol;
};

const isFinalType = (t: Type<ts.Type>) =>
  t.isNumber() || t.isString() || t.isBoolean() || t.isLiteral();
const isNullType = (t: Type<ts.Type>) => t.isNull() || t.isUndefined();

const getTypeGenericText = (t: Type<ts.Type>) => {
  if (t.isStringLiteral() || t.isNumberLiteral() || t.isBooleanLiteral()) {
    return t.getBaseTypeOfLiteralType().getText();
  } else {
    return t.getText();
  }
};

const getApparentTypeName = (t: Type<ts.Type>) => {
  return t.getApparentType().getText().toLowerCase();
};

const regenerateTypeSchema = (t: Type<ts.Type>) => {
  if (isFinalType(t)) {
    return { type: getTypeGenericText(t) };
  }

  if (t.isUnion()) {
    const nulled = t.getUnionTypes().some((nt) => isNullType(nt));
    const cleanTypes = h.cleanNullableTypes(t.getUnionTypes());
    let returning: { nullable?: true; anyOf?: any[]; type?: string } = {};

    const transformed = cleanTypes.reduce((acc, ut) => {
      const regenerated = regenerateTypeSchema(ut);
      if (find(acc, regenerated)) return acc;
      return acc.concat(regenerated);
    }, [] as any);

    if (transformed.length > 1) {
      returning.anyOf = transformed;
    } else {
      returning = transformed[0];
    }

    if (nulled) {
      returning.nullable = true;
    }
    return returning;
  }

  if (t.isIntersection()) {
    return t.getIntersectionTypes().reduce((acc, it) => {
      acc = { ...acc, ...regenerateTypeSchema(it) };
      return acc;
    }, {} as any);
  }

  if (t.isArray()) {
    return {
      type: 'array',
      items: regenerateTypeSchema(t.getArrayElementType()!),
    };
  }

  if (t.isInterface() || t.isObject()) {
    const result = t.getProperties().reduce(
      (acc, ci) => {
        const val = ci.getValueDeclaration()!;
        acc.properties = { ...acc.properties, [ci.getName()]: regenerateTypeSchema(val.getType()) };
        return acc;
      },
      { type: 'object', properties: {} } as any,
    );
    return result;
  }

  return {
    type: getApparentTypeName(t),
  };
};

function returnFinder(base?: ClassMemberTypes) {
  const refsAcrossProject = base
    ?.getChildrenOfKind(ts.SyntaxKind.Identifier)[0]
    .findReferences()[0]
    .getReferences()
    ?.filter(
      (re) =>
        !re.compilerObject.fileName.includes('node_modules/barehttp/lib') &&
        !re.compilerObject.fileName.includes('bare-http/src/server.ts'),
    );

  if (!refsAcrossProject?.length) {
    console.log('There are no routes declarations across the project');
    process.exit(0);
  }

  const extractedReturns = refsAcrossProject
    .map((ref) => {
      return ref
        .getNode()
        .getAncestors()
        .find((n) => n.getKind() === ts.SyntaxKind.CallExpression)
        ?.getChildren()
        .find((n) => n.getKind() === ts.SyntaxKind.SyntaxList)
        ?.getFirstChild()
        ?.getChildSyntaxList()
        ?.getChildren()
        .filter((c) => {
          return (
            c.getKind() === ts.SyntaxKind.PropertyAssignment &&
            c.getSymbol()?.getName() === 'handler'
          );
        })

        .map((c) =>
          c
            .getChildren()
            .find(
              (n) =>
                n.getKind() === ts.SyntaxKind.ArrowFunction ||
                n.getKind() === ts.SyntaxKind.FunctionExpression,
            )
            ?.getLastChild()
            ?.getChildSyntaxList(),
        );
    })
    .flat()
    .map((n) => {
      return getReturnStatements(n);
    })
    .flat();

  const schemas = extractedReturns.map((t) => regenerateTypeSchema(t!));

  return schemas;
}

const res = tp
  ?.getChildrenOfKind(ts.SyntaxKind.Identifier)[0]
  .findReferences()[0]
  .getReferences()
  .filter((ref) => !ref.compilerObject.fileName.includes('server.ts'))[0]
  .getNode()
  .getAncestors()
  .filter((n) => n.getKind() === ts.SyntaxKind.CallExpression)[0]
  .getAncestors()[0]
  .getChildrenOfKind(ts.SyntaxKind.CallExpression)[0]
  .getChildrenOfKind(ts.SyntaxKind.SyntaxList)[0]
  .getChildren()[0]
  .getChildrenOfKind(ts.SyntaxKind.SyntaxList)[0]
  .getChildrenOfKind(ts.SyntaxKind.PropertyAssignment)
  .find((node) =>
    node
      .getChildren()
      .find(
        (n) =>
          n.getKind() === ts.SyntaxKind.ArrowFunction ||
          n.getKind() === ts.SyntaxKind.FunctionExpression,
      ),
  )
  ?.getChildren()
  ?.find((c) => c.getKind() === ts.SyntaxKind.FunctionExpression)
  ?.getLastChild()
  ?.getChildSyntaxList()
  ?.getChildren()
  .filter((c) => c.getKind() === ts.SyntaxKind.IfStatement)[0]
  .getChildren()
  .find((c) => c.getKind() === ts.SyntaxKind.Block)
  ?.getChildSyntaxList();

const getReturnStatements = (n?: SyntaxList | Node<ts.Node>) => {
  if (!n) return [];

  let baseChildren = n?.getChildren() as any;

  const thereIf = baseChildren?.find((c) => c.getKind() === ts.SyntaxKind.IfStatement);
  const thereBlock = baseChildren?.find((c) => c.getKind() === ts.SyntaxKind.Block);
  const thereWhile = baseChildren?.find((c) => c.getKind() === ts.SyntaxKind.WhileKeyword);
  const thereFor = baseChildren?.find((c) => c.getKind() === ts.SyntaxKind.ForStatement);

  if (thereIf || thereBlock || thereWhile || thereFor) {
    baseChildren = baseChildren?.concat(
      getReturnStatements(thereIf),
      getReturnStatements(thereWhile),
      getReturnStatements(thereBlock),
      getReturnStatements(thereFor),
    );
  }
  console.log({ baseChildren });

  return baseChildren
    ?.filter((c) => c.getKind() === ts.SyntaxKind.ReturnStatement)
    .map((r) =>
      r
        .getChildren()
        .find((c) => c.getType().isLiteral() || c.getType().isObject())
        ?.getType(),
    );
};

console.log(returnFinder(tp));
// logInternals(getReturnStatements(res!)?.map((t) => regenerateTypeSchema(t!)));

// regenerateTypeSchema(res![0].getType());
// logInternals(regenerateTypeSchema(res![0].getType()));
// console.log(regenerateTypeSchema(res![0].getType()));
