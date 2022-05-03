import { ClassMemberTypes, Node, Project, ReferenceEntry, SyntaxList, ts, Type } from 'ts-morph';

import { generateCustomSchema } from './custom-schema';
import { isFinalType, isHandler, isRoute } from './helpers';
import { convertToJsonSchema } from './json-schema';

import path from 'path';
import { existsSync } from 'fs';

const nodeModulesFile = path.join(process.cwd(), 'node_modules', 'barehttp', 'tsconfig.build.json');
const filePath = existsSync(nodeModulesFile) ? nodeModulesFile : './tsconfig.json'; // for test purposes

const project = new Project({ tsConfigFilePath: filePath });
project.enableLogging();

const serverSourceFile = project.getSourceFile('server.ts');
const requestSourceFile = project.getSourceFile('request.ts');

const routes = serverSourceFile?.getClass('BareServer')?.getMember('route');
const runtimeRoutes = serverSourceFile?.getClass('BareServer')?.getMember('runtimeRoute');
const flowJson = requestSourceFile?.getClass('BareRequest')?.getMember('json');
const flowSend = requestSourceFile?.getClass('BareRequest')?.getMember('send');

const acceptedPropertyNames = ['get', 'post', 'put', 'delete', 'options', 'head', 'patch'];

const getReferences = (fileRoute: string, target?: ClassMemberTypes) => {
  if (!target) return [];
  return target
    ?.getChildrenOfKind(ts.SyntaxKind.Identifier)[0]
    .findReferences()[0]
    .getReferences()
    ?.filter((re) => {
      return re.compilerObject.fileName.includes(fileRoute);
    });
};

const getFlowNodes = (n?: ClassMemberTypes) => {
  if (!n) return [];
  return n
    .getChildrenOfKind(ts.SyntaxKind.Identifier)[0]
    .findReferences()[0]
    .getReferences()
    .map((r) => r.getNode().getParent()?.getParent())
    .filter((p) => p?.getKind() === ts.SyntaxKind.CallExpression)
    .map((p) => p?.getNodeProperty('arguments' as any));
};

console.log({
  ...getReferences('examples', flowJson),
  ...getReferences('examples', flowSend),
});
export const generateRouteSchema = (fileRouteToDeclarations: string) => {
  if (!routes && !runtimeRoutes) {
    throw new Error('No project been allocated, theres some issue');
  }

  const allReferences: ReferenceEntry[] = [
    ...getReferences(fileRouteToDeclarations, routes),
    ...getReferences(fileRouteToDeclarations, runtimeRoutes),
  ];

  const extractedReturns = allReferences.map((ref) => {
    const methodName = ref
      .getNode()
      .getAncestors()
      .map((n) => n.getSymbol()?.getName())
      .filter((param) => acceptedPropertyNames.includes(param!))
      .pop();

    if (!methodName) {
      return [];
    }

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
            methodName,
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
          methodName,
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
        acc.methodName = curr.methodName as any;
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
      }, {} as { handler: SyntaxList; route: string; methodName: 'get' | 'post' | 'put' | 'delete' | 'options' | 'head' | 'patch' });
    })
    .map((routeCombination) => ({
      ...routeCombination,
      handler: getReturnStatements(routeCombination.handler),
    }));

  const flowNodes = [...getFlowNodes(flowJson), ...getFlowNodes(flowSend)]
    .flat()
    .filter(Boolean)
    .map((t) => t.getType())
    .map(generateCustomSchema);

  console.log({ flowNodes });
  const schemas = perRoute
    .filter((pr) => pr.route && pr.handler.length)
    .map(({ handler, route, methodName }) => {
      console.log({ handler });
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
        methodName,
        schemas,
        finalSchema,
        jsonSchema: convertToJsonSchema(finalSchema),
      };
    });

  return [...schemas, ...flowNodes];
};

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

const getTypes = (nodes: Node<ts.Node>[]) =>
  nodes
    .map((r) =>
      r.getChildren().find((c) => {
        const type = c.getType();
        return type.isObject() || isFinalType(type);
      }),
    )
    .filter((n) => n)
    .map((acc) => acc!.getType());

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
};

// returnGeneratedCodeSchemas('examples', tp);
console.log(generateRouteSchema('examples'));
