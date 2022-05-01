import find from 'lodash/find';
import { ts, Type } from 'ts-morph';

import {
  getApparentTypeName,
  getTypeGenericText,
  helpers,
  isFinalType,
  isNullType,
} from './helpers';
// (type: X, is: K): type is T

// export const customTypeIs = <
//   X extends CustomSchema,
//   K extends 'string' | 'number' | 'boolean' | 'array' | 'object' | 'union',
//   T extends X['type'],
//   R = T extends 'string'
//     ? StringSchemaType
//     : T extends 'number'
//     ? NumberSchemaType
//     : T extends 'object'
//     ? ObjectSchemaType
//     : T extends 'array'
//     ? ArraySchemaType
//     : T extends 'union'
//     ? UnionSchemaType
//     : CustomSchema,
//   // R = ,
//   // T extends { [P in keyof CustomSchema]: CustomSchema['type'] extends 'string' ? string : never },
// >(
//   type: X,
//   is: K,
// ): type is R => type.type === is;

// const testType: CustomSchema = { type: 'string', nullable: true } as any;

// if (customTypeIs(testType, 'string')) {
//   testType;
// }

export type StringSchemaType = {
  type: 'string';
  nullable: boolean;
};

export type NumberSchemaType = {
  type: 'number';
  nullable: boolean;
};

export type BooleanSchemaType = {
  type: 'boolean';
  nullable: boolean;
};

export type ArraySchemaType = {
  type: 'array';
  items:
    | StringSchemaType
    | NumberSchemaType
    | BooleanSchemaType
    | ArraySchemaType
    | ObjectSchemaType;
  nullable: boolean;
};

export type ObjectSchemaType = {
  type: 'object';
  properties: {
    [key: string]:
      | StringSchemaType
      | NumberSchemaType
      | BooleanSchemaType
      | ArraySchemaType
      | ObjectSchemaType;
  };
  nullable: boolean;
};

export type UnionSchemaType = {
  type: 'union';
  anyOf: CustomSchema[];
  nullable: boolean;
};

export type CustomSchema =
  | StringSchemaType
  | NumberSchemaType
  | BooleanSchemaType
  | ArraySchemaType
  | ObjectSchemaType
  | UnionSchemaType;

export const generateCustomSchema = (t: Type<ts.Type>): CustomSchema => {
  if (isFinalType(t)) {
    return { type: getTypeGenericText(t), nullable: false } as CustomSchema;
  }

  if (t.isUnion()) {
    const nulled = t.getUnionTypes().some((nt) => isNullType(nt));
    const cleanTypes = helpers.cleanNullableTypes(t.getUnionTypes());
    let returning: { nullable?: boolean; anyOf?: any[]; type?: string } = {
      nullable: false,
      type: 'union',
    };

    const transformed = cleanTypes.reduce((acc, ut) => {
      const regenerated = generateCustomSchema(ut);
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
    return returning as CustomSchema;
  }

  if (t.isIntersection()) {
    return t.getIntersectionTypes().reduce((acc, it) => {
      const generatedSchema = generateCustomSchema(it);

      if (Object.keys(acc).length === 0) {
        acc = generatedSchema;
        return acc;
      }

      if (generatedSchema.type === acc.type && acc.type === 'object') {
        acc.properties = { ...acc.properties, ...(generatedSchema as any).properties };
      }
      return acc;
    }, {} as any);
  }

  if (t.isArray()) {
    return {
      type: 'array',
      items: generateCustomSchema(t.getArrayElementType()!),
    } as CustomSchema;
  }

  if (t.isInterface() || t.isObject()) {
    const result = t.getProperties().reduce(
      (acc, ci) => {
        const val = ci.getValueDeclaration()!;
        acc.properties = { ...acc.properties, [ci.getName()]: generateCustomSchema(val.getType()) };
        return acc;
      },
      { type: 'object', properties: {} } as any,
    );

    return result;
  }

  return {
    type: getApparentTypeName(t),
    nullable: false,
  } as any;
};
