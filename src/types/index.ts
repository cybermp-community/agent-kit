export interface EventParameter {
  name: string;
  type: string;
  optional?: boolean;
  isRest?: boolean;
  description?: string;
}

export interface EventRecord {
  name: string;
  env: 'server' | 'client' | 'browser';
  category?: string;
  description?: string;
  parameters: EventParameter[];
  returnType: string;
  signature: string;
  source?: string;
}

export interface PropertyRecord {
  name: string;
  type: string;
  optional?: boolean;
  readonly?: boolean;
  description?: string;
}

export interface MethodParameter {
  name: string;
  type: string;
  optional?: boolean;
  isRest?: boolean;
  description?: string;
}

export interface MethodRecord {
  name: string;
  parameters: MethodParameter[];
  returnType: string;
  signature: string;
  description?: string;
}

export interface EnumMemberRecord {
  name: string;
  value?: string | number;
  description?: string;
}

export interface TypeRecord {
  name: string;
  kind: 'interface' | 'class' | 'enum' | 'type';
  env: 'server' | 'client' | 'browser' | 'shared';
  category?: string;
  source?: string;
  description?: string;
  properties: PropertyRecord[];
  methods: MethodRecord[];
  typeParameters?: string[];
  extends?: string[];
  rawDefinition?: string;
  enumMembers?: EnumMemberRecord[];
}

export interface GuideRecord {
  title: string;
  guideTitle?: string;
  sectionTitle?: string;
  description?: string;
  slug: string;
  url: string;
  codeSnippets: string[];
  plainText: string;
}

export interface BuildIndexResult {
  eventsCount: number;
  typesCount: number;
  guidesCount: number;
  eventsPath: string;
  typesPath: string;
  guidesPath: string;
}
