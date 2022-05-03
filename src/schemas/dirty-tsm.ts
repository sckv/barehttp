import { ClassMemberTypes, Node, Project, SyntaxList, ts, Type } from 'ts-morph';

import { generateCustomSchema } from './custom-schema';
import { isFinalType, logInternals } from './helpers';
import { convertToJsonSchema } from './json-schema';

const project = new Project({ tsConfigFilePath: 'tsconfig.json' });
project.enableLogging();

const sourceFile = project.getSourceFile('server.ts');

const tp = sourceFile?.getClass('BareServer')?.getMember('route');

const isHandler = (c: Node<ts.Node>) => c.getSymbol()?.getName() === 'handler';
const isRoute = (c: Node<ts.Node>) => c.getSymbol()?.getName() === 'route';
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

  const extractedReturns = refsAcrossProject.map((ref) => {
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
        return c.getKind() === ts.SyntaxKind.PropertyAssignment && (isHandler(c) || isRoute(c));
      })
      .map((c) => {
        if (isHandler(c)) {
          return {
            type: 'handler',
            syntaxList: c
              .getChildren()
              .find(
                (n) =>
                  n.getKind() === ts.SyntaxKind.ArrowFunction ||
                  n.getKind() === ts.SyntaxKind.FunctionExpression,
              )
              ?.getLastChild()
              ?.getChildSyntaxList(),
          };
        }

        return {
          type: 'route',
          value: c
            .getNodeProperty('initializer' as any)
            .getText()
            ?.replaceAll("'", ''),
        };
      });
  });

  const perRoute = extractedReturns
    .map((routeCombination) => {
      return routeCombination!.reduce((acc, curr) => {
        if (curr.type === 'handler') {
          return {
            ...acc,
            handler: curr.syntaxList,
          };
        } else {
          return {
            ...acc,
            route: curr.value,
          } as any;
        }
      }, {} as { handler: SyntaxList; route: string });
    })
    .map((routeCombination) => ({
      ...routeCombination,
      handler: getReturnStatements(routeCombination.handler),
    }));

  const schemas = perRoute.map(({ handler, route }) => {
    const schemas = handler.map((t) => generateCustomSchema(t));
    let finalSchema = schemas[0];
    if (schemas.length > 1) {
      finalSchema = {
        type: 'union',
        nullable: false,
        anyOf: schemas,
      };
    }

    return {
      route,
      schemas,
      finalSchema,
    };
  });

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

const extractReturnStatements = (accumulator: Node<ts.Node>[], n?: Node<ts.Node>) => {
  if (!n) return;

  if (ts.SyntaxKind.IfStatement === n.getKind()) {
    const thenProp = n.getNodeProperty('thenStatement' as any);
    const elseProp = n.getNodeProperty('elseStatement' as any);
    const thenSyntax = thenProp?.getChildSyntaxList();
    const elseSyntax = elseProp?.getChildSyntaxList();

    extractReturnStatements(accumulator, thenSyntax);
    extractReturnStatements(accumulator, elseSyntax);

    return;
  }

  if (n.getChildren().length) {
    const cleanChildren = n.getChildren().filter((c) => typeof c.getKind === 'function');

    const findReturn = cleanChildren.find((c) => c.getKind() === ts.SyntaxKind.ReturnStatement);
    const thereIf = cleanChildren.find((c) => c.getKind() === ts.SyntaxKind.IfStatement);
    const thereWhile = cleanChildren.find((c) => c.getKind() === ts.SyntaxKind.WhileKeyword);
    const thereFor = cleanChildren.find((c) => c.getKind() === ts.SyntaxKind.ForStatement);

    const syntaxList = n.getChildSyntaxList();

    if (findReturn) {
      accumulator.push(findReturn);
    }

    extractReturnStatements(accumulator, thereIf);
    extractReturnStatements(accumulator, thereWhile);
    extractReturnStatements(accumulator, thereFor);
    extractReturnStatements(accumulator, syntaxList);
  }
};

const getReturnStatements = (n?: SyntaxList | Node<ts.Node>): Type<ts.Type>[] => {
  if (!n) return [] as any[];

  const accumulator = [] as Node<ts.Node>[];
  extractReturnStatements(accumulator, n);

  return accumulator
    .map((r) =>
      r.getChildren().find((c) => {
        const type = c.getType();
        return type.isObject() || isFinalType(type);
      }),
    )
    .filter((n) => n)
    .map((acc) => acc!.getType());
  // console.log({ accumulator });
  // let baseChildren = n?.getChildren()?.filter((c) => typeof c.getKind === 'function') ?? [];

  // baseChildren = baseChildren.flat(5).filter((c) => typeof c.getKind === 'function');

  // if (thereIf || thereBlock || thereWhile || thereFor) {
  //   baseChildren?.push(
  //     getReturnStatements(thereIf) as any,
  //     getReturnStatements(thereWhile) as any,
  //     getReturnStatements(thereBlock) as any,
  //     getReturnStatements(thereFor) as any,
  //   );
  // }

  // baseChildren = baseChildren.flat(5).filter((c) => typeof c.getKind === 'function');

  // return baseChildren
  //   .filter((c) => typeof c.getKind === 'function')
  //   .filter((c) => c.getKind() === ts.SyntaxKind.ReturnStatement)
  //   .map((r) =>
  //     r.getChildren().find((c) => {
  //       const type = c.getType();
  //       return type.isObject() || isFinalType(type);
  //     }),
  //   )
  //   .filter((v) => v)
  //   .map((v) => v!.getType());
};

// returnFinder('examples', tp);
logInternals(returnFinder('examples', tp));

// logInternals(returnFinder('examples', tp).map((s) => convertToJsonSchema(s)));
// console.log(tp);
// logInternals(getReturnStatements(res!)?.map((t) => regenerateTypeSchema(t!)));

// regenerateTypeSchema(res![0].getType());
// logInternals(regenerateTypeSchema(res![0].getType()));
// console.log(regenerateTypeSchema(res![0].getType()));
