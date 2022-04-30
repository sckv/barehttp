import { ClassMemberTypes, Node, Project, SyntaxList, ts, Type } from 'ts-morph';
import find from 'lodash/find';

import {
  getApparentTypeName,
  getTypeGenericText,
  helpers,
  isFinalType,
  isNullType,
  logInternals,
} from './helpers';

const project = new Project({ tsConfigFilePath: 'tsconfig.json' });
project.enableLogging();

const sourceFile = project.getSourceFile('server.ts');

const tp = sourceFile?.getClass('BareServer')?.getMember('route');

const regenerateTypeSchema = (t: Type<ts.Type>) => {
  if (isFinalType(t)) {
    return { type: getTypeGenericText(t) };
  }

  if (t.isUnion()) {
    const nulled = t.getUnionTypes().some((nt) => isNullType(nt));
    const cleanTypes = helpers.cleanNullableTypes(t.getUnionTypes());
    let returning: { nullable?: boolean; anyOf?: any[]; type?: string } = { nullable: false };

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

function returnFinder(route: string, base?: ClassMemberTypes) {
  if (!base) {
    throw new Error('No project been allocated, theres some issue');
  }

  const refsAcrossProject = base
    .getChildrenOfKind(ts.SyntaxKind.Identifier)[0]
    .findReferences()[0]
    .getReferences()
    ?.filter((re) => re.compilerObject.fileName.includes(route));

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
  // console.log({ extractedReturns });

  return schemas;
}

// const res = tp
//   ?.getChildrenOfKind(ts.SyntaxKind.Identifier)[0]
//   .findReferences()[0]
//   .getReferences()
//   .filter((ref) => !ref.compilerObject.fileName.includes('server.ts'))[0]
//   .getNode()
//   .getAncestors()
//   .filter((n) => n.getKind() === ts.SyntaxKind.CallExpression)[0]
//   .getAncestors()[0]
//   .getChildrenOfKind(ts.SyntaxKind.CallExpression)[0]
//   .getChildrenOfKind(ts.SyntaxKind.SyntaxList)[0]
//   .getChildren()[0]
//   .getChildrenOfKind(ts.SyntaxKind.SyntaxList)[0]
//   .getChildrenOfKind(ts.SyntaxKind.PropertyAssignment)
//   .find((node) =>
//     node
//       .getChildren()
//       .find(
//         (n) =>
//           n.getKind() === ts.SyntaxKind.ArrowFunction ||
//           n.getKind() === ts.SyntaxKind.FunctionExpression,
//       ),
//   )
//   ?.getChildren()
//   ?.find((c) => c.getKind() === ts.SyntaxKind.FunctionExpression)
//   ?.getLastChild()
//   ?.getChildSyntaxList()
//   ?.getChildren()
//   .filter((c) => c.getKind() === ts.SyntaxKind.IfStatement)[0]
//   .getChildren()
//   .find((c) => c.getKind() === ts.SyntaxKind.Block)
//   ?.getChildSyntaxList();

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

  return baseChildren
    ?.filter((c) => c.getKind() === ts.SyntaxKind.ReturnStatement)
    .map((r) =>
      r
        .getChildren()
        .find((c) => c.getType().isLiteral() || c.getType().isObject())
        ?.getType(),
    );
};

logInternals(returnFinder('examples', tp));

// console.log(tp);
// logInternals(getReturnStatements(res!)?.map((t) => regenerateTypeSchema(t!)));

// regenerateTypeSchema(res![0].getType());
// logInternals(regenerateTypeSchema(res![0].getType()));
// console.log(regenerateTypeSchema(res![0].getType()));
