import { ArraySchemaType, CustomSchema } from './custom-schema';

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
  }
};
