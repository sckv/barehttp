import { ArraySchemaType, CustomSchema, ObjectSchemaType, UnionSchemaType } from './custom-schema.js';

export const convertToJsonSchema = (schema: CustomSchema) => {
  if (schema.type === 'string') {
    return {
      type: 'string',
    };
  }
  if (schema.type === 'number') {
    return {
      type: 'number',
    };
  }
  if (schema.type === 'boolean') {
    return {
      type: 'boolean',
    };
  }

  if (schema.type === 'array') {
    const reSchema = schema as ArraySchemaType;
    return {
      type: 'array',
      items: convertToJsonSchema(reSchema.items),
    };
  }

  if (schema.type === 'object') {
    const reSchema = schema as ObjectSchemaType;
    const objectJsonedProperties = Object.keys(reSchema.properties).reduce((acc, key) => {
      acc[key] = convertToJsonSchema(reSchema.properties[key]);
      return acc;
    }, {} as any);

    const required = (Object.entries(reSchema.properties) as Array<[string, CustomSchema]>).reduce(
      (acc, [key, value]) => {
      if (!value.nullable) {
        acc.push(key);
      }
      return acc;
    },
      [] as string[],
    );

    return {
      required,
      type: 'object',
      properties: objectJsonedProperties,
    };
  }

  if (schema.type === 'union') {
    const reSchema = schema as UnionSchemaType;
    return {
      anyOf: reSchema.anyOf.map((item) => convertToJsonSchema(item)),
    };
  }
};
