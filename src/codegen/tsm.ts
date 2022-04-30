import { ClassMemberTypes, Node, Project, SyntaxList, ts, Type } from 'ts-morph';

import { generateCustomSchema } from './custom-schema';
import { isFinalType, logInternals } from './helpers';

const project = new Project({ tsConfigFilePath: 'tsconfig.json' });
project.enableLogging();

const sourceFile = project.getSourceFile('server.ts');

const tp = sourceFile?.getClass('BareServer')?.getMember('route');

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

  const schemas = extractedReturns.map((t) => generateCustomSchema(t!));
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
  if (!n) return [] as any[];

  let baseChildren = n?.getChildren();

  const thereIf = baseChildren?.find((c) => c.getKind() === ts.SyntaxKind.IfStatement);
  const thereBlock = baseChildren?.find((c) => c.getKind() === ts.SyntaxKind.Block);
  const thereWhile = baseChildren?.find((c) => c.getKind() === ts.SyntaxKind.WhileKeyword);
  const thereFor = baseChildren?.find((c) => c.getKind() === ts.SyntaxKind.ForStatement);

  if (thereIf || thereBlock || thereWhile || thereFor) {
    baseChildren = baseChildren
      ?.concat(
        getReturnStatements(thereIf),
        getReturnStatements(thereWhile),
        getReturnStatements(thereBlock),
        getReturnStatements(thereFor),
      )
      .flat();
  }

  return baseChildren
    .filter((c) => c.getKind() === ts.SyntaxKind.ReturnStatement)
    .map((r) =>
      r.getChildren().find((c) => {
        const type = c.getType();
        return type.isObject() || isFinalType(type);
      }),
    )
    .filter((v) => v)
    .map((v) => v!.getType());
};

logInternals(returnFinder('examples', tp));

// console.log(tp);
// logInternals(getReturnStatements(res!)?.map((t) => regenerateTypeSchema(t!)));

// regenerateTypeSchema(res![0].getType());
// logInternals(regenerateTypeSchema(res![0].getType()));
// console.log(regenerateTypeSchema(res![0].getType()));
