import {
    ContainerType,
    DeclaredTypeName,
    EnumTypeDeclaration,
    ExampleTypeShape,
    HttpEndpoint,
    Name,
    NameAndWireValue,
    ObjectTypeDeclaration,
    TypeReference,
    UnionTypeDeclaration
} from "@fern-fern/ir-sdk/api";
import { FdrSnippetTemplate } from "@fern-fern/snippet-sdk";
import { GetReferenceOpts, getTextOfTsNode, ImportsManager, NpmPackage, PackageId } from "@fern-typescript/commons";
import { GeneratedEnumType, SdkContext } from "@fern-typescript/contexts";
import { Project, ts } from "ts-morph";

// Write this in the fern def to share between FE + BE
const TEMPLATE_SENTINEL = "$FERN_INPUT";

export class TemplateGenerator {
    private endpointContext: SdkContext;
    private clientContext: SdkContext;
    private opts: GetReferenceOpts;
    private npmPackage: NpmPackage;
    private endpoint: HttpEndpoint;
    private packageId: PackageId;
    private rootPackageId: PackageId;
    private retainOriginalCasing: boolean;

    constructor({
        clientContext,
        endpointContext,
        npmPackage,
        endpoint,
        packageId,
        rootPackageId,
        retainOriginalCasing
    }: {
        clientContext: SdkContext;
        endpointContext: SdkContext;
        npmPackage: NpmPackage;
        endpoint: HttpEndpoint;
        packageId: PackageId;
        rootPackageId: PackageId;
        retainOriginalCasing: boolean;
    }) {
        this.endpointContext = endpointContext;
        this.clientContext = clientContext;
        this.npmPackage = npmPackage;
        this.endpoint = endpoint;
        this.packageId = packageId;
        this.rootPackageId = rootPackageId;
        this.retainOriginalCasing = retainOriginalCasing;

        this.opts = { isForSnippet: true };
    }

    private getPropertyKey(name: Name): string {
        return this.retainOriginalCasing ? name.originalName : name.camelCase.unsafeName;
    }

    // Get the dot access path to the object within the broader json object
    private getBreadCrumbPath({
        wireOrOriginalName,
        nameBreadcrumbs
    }: {
        wireOrOriginalName: string | undefined;
        nameBreadcrumbs: string[] | undefined;
    }): string | undefined {
        let crumbs: string[] = [];
        if (wireOrOriginalName == null && nameBreadcrumbs != null) {
            crumbs = nameBreadcrumbs;
        } else if (wireOrOriginalName != null && (nameBreadcrumbs == null || nameBreadcrumbs.length === 0)) {
            crumbs = [wireOrOriginalName];
        } else if (wireOrOriginalName != null && nameBreadcrumbs != null) {
            crumbs = [...nameBreadcrumbs, wireOrOriginalName];
        } else {
            // They're both undefined, return undefined
            return undefined;
        }

        return crumbs.join(".");
    }

    private getBaseGenericTemplate({
        name,
        location,
        wireOrOriginalName,
        nameBreadcrumbs
    }: {
        name: string | undefined;
        location: FdrSnippetTemplate.PayloadLocation;
        wireOrOriginalName: string | undefined;
        nameBreadcrumbs: string[] | undefined;
    }): FdrSnippetTemplate.Template {
        return FdrSnippetTemplate.Template.generic({
            imports: [],
            templateString: name != null ? `${name}: ${TEMPLATE_SENTINEL}` : `"${TEMPLATE_SENTINEL}"`,
            isOptional: true,
            templateInputs: [
                FdrSnippetTemplate.TemplateInput.payload({
                    location,
                    path: this.getBreadCrumbPath({ wireOrOriginalName, nameBreadcrumbs })
                })
            ]
        });
    }

    private getAsNamedParameterTemplate(name: string | undefined, coreTemplate: string): string {
        return name != null ? `${name}: ${coreTemplate}` : coreTemplate;
    }

    private getEnumTemplate({
        etd,
        generatedEnum,
        name,
        location,
        wireOrOriginalName,
        nameBreadcrumbs
    }: {
        etd: EnumTypeDeclaration;
        generatedEnum: GeneratedEnumType<SdkContext>;
        name: string | undefined;
        location: FdrSnippetTemplate.PayloadLocation;
        wireOrOriginalName: string | undefined;
        nameBreadcrumbs: string[] | undefined;
    }): FdrSnippetTemplate.Template {
        const mappedEnumValues: Record<string, string> = {};
        etd.values.forEach((ev) => {
            const mockExampleTypeShape: ExampleTypeShape = ExampleTypeShape.enum({ value: ev.name });
            const enumValue = generatedEnum.buildExample(mockExampleTypeShape, this.endpointContext, this.opts);
            mappedEnumValues[ev.name.wireValue] = getTextOfTsNode(enumValue);
        });

        return FdrSnippetTemplate.Template.enum({
            imports: [],
            isOptional: true,
            values: mappedEnumValues,
            templateString: this.getAsNamedParameterTemplate(name, `'${TEMPLATE_SENTINEL}'`),
            templateInput: FdrSnippetTemplate.TemplateInput.payload({
                location,
                path: this.getBreadCrumbPath({ wireOrOriginalName, nameBreadcrumbs })
            })
        });
    }

    private getUnionTemplate({
        utd,
        name,
        location,
        wireOrOriginalName,
        nameBreadcrumbs,
        indentationLevel
    }: {
        utd: UnionTypeDeclaration;
        name: string | undefined;
        location: FdrSnippetTemplate.PayloadLocation;
        wireOrOriginalName: string | undefined;
        nameBreadcrumbs: string[] | undefined;
        indentationLevel: number;
    }): FdrSnippetTemplate.Template | undefined {
        const childIndentationLevel = indentationLevel + 1;
        const childTabs = "\t".repeat(childIndentationLevel);
        const childBreadcrumbs: string[] = [...(nameBreadcrumbs ?? [])];
        if (name != null) {
            childBreadcrumbs.push(name);
        }

        const selfTabs = "\t".repeat(indentationLevel);
        const memberTemplates: Record<string, FdrSnippetTemplate.Template> = {};
        for (const member of utd.types) {
            const memberTemplate = member.shape._visit<FdrSnippetTemplate.Template | undefined>({
                samePropertiesAsObject: (utdodtn) => {
                    const namedTypeTemplate = this.getNamedTypeTemplate({
                        typeName: utdodtn,
                        name: undefined,
                        location,
                        wireOrOriginalName,
                        nameBreadcrumbs,
                        indentationLevel: childIndentationLevel
                    });

                    return FdrSnippetTemplate.Template.generic({
                        imports: [],
                        templateString: this.getAsNamedParameterTemplate(
                            name,
                            `{ \n${childTabs}${this.getPropertyKey(utd.discriminant.name)} : "${
                                member.discriminantValue.wireValue
                            }", \n${childTabs}${TEMPLATE_SENTINEL}\n${selfTabs}}`
                        ),
                        isOptional: true,
                        templateInputs:
                            namedTypeTemplate != null ? [this.getTemplateInputFromTemplate(namedTypeTemplate)] : []
                    });
                },
                singleProperty: (utdsp) => {
                    const singlePropertyTemplate = this.getTemplateInputFromTypeReference({
                        typeReference: utdsp.type,
                        name: this.getPropertyKey(utdsp.name.name),
                        location,
                        wireOrOriginalName: utdsp.name.wireValue,
                        nameBreadcrumbs: childBreadcrumbs,
                        indentationLevel: childIndentationLevel
                    });
                    return FdrSnippetTemplate.Template.generic({
                        imports: [],
                        templateString: this.getAsNamedParameterTemplate(
                            name,
                            `{ \n${childTabs}${this.getPropertyKey(utd.discriminant.name)} : "${
                                member.discriminantValue.wireValue
                            }", \n${childTabs}${TEMPLATE_SENTINEL}\n${selfTabs}}`
                        ),
                        isOptional: true,
                        templateInputs: singlePropertyTemplate != null ? [singlePropertyTemplate] : []
                    });
                },
                noProperties: () =>
                    FdrSnippetTemplate.Template.generic({
                        imports: [],
                        templateString: this.getAsNamedParameterTemplate(
                            name,
                            `{ ${this.getPropertyKey(utd.discriminant.name)} : "${
                                member.discriminantValue.wireValue
                            }" }`
                        ),
                        isOptional: true,
                        templateInputs: []
                    }),
                _other: () => undefined
            });

            if (memberTemplate != null) {
                memberTemplates[member.discriminantValue.wireValue] = memberTemplate;
            }
        }

        return FdrSnippetTemplate.Template.discriminatedUnion({
            imports: [],
            isOptional: true,
            templateString: this.getAsNamedParameterTemplate(name, `'${TEMPLATE_SENTINEL}'`),
            discriminantField: utd.discriminant.wireValue,
            members: memberTemplates,
            templateInput: FdrSnippetTemplate.TemplateInput.payload({
                location,
                path: this.getBreadCrumbPath({ wireOrOriginalName, nameBreadcrumbs })
            })
        });
    }

    private getObjectTemplate({
        otd,
        name,
        location,
        wireOrOriginalName,
        nameBreadcrumbs,
        indentationLevel
    }: {
        otd: ObjectTypeDeclaration;
        name: string | undefined;
        location: FdrSnippetTemplate.PayloadLocation;
        wireOrOriginalName: string | undefined;
        nameBreadcrumbs: string[] | undefined;
        indentationLevel: number;
    }): FdrSnippetTemplate.Template | undefined {
        const childIndentationLevel = indentationLevel + 1;
        const childTabs = "\t".repeat(childIndentationLevel);
        const selfTabs = "\t".repeat(indentationLevel);
        const templateInputs: FdrSnippetTemplate.TemplateInput[] = [];
        for (const prop of otd.properties) {
            const childBreadcrumbs = nameBreadcrumbs != null ? [...nameBreadcrumbs] : [];
            if (wireOrOriginalName != null) {
                childBreadcrumbs.push(wireOrOriginalName);
            }
            const propInput = this.getTemplateInputFromTypeReference({
                typeReference: prop.valueType,
                name: this.getPropertyKey(prop.name.name),
                location,
                wireOrOriginalName: prop.name.wireValue,
                nameBreadcrumbs: childBreadcrumbs,
                indentationLevel: childIndentationLevel
            });

            if (propInput != null) {
                templateInputs.push(propInput);
            }
        }
        return FdrSnippetTemplate.Template.generic({
            imports: [],
            templateString: this.getAsNamedParameterTemplate(name, `{\n${childTabs}${TEMPLATE_SENTINEL}\n${selfTabs}}`),
            isOptional: true,
            inputDelimiter: `,\n${childTabs}`,
            templateInputs
        });
    }

    private getNamedTypeTemplate({
        typeName,
        name,
        location,
        wireOrOriginalName,
        nameBreadcrumbs,
        indentationLevel
    }: {
        typeName: DeclaredTypeName;
        name: string | undefined;
        location: FdrSnippetTemplate.PayloadLocation;
        wireOrOriginalName: string | undefined;
        nameBreadcrumbs: string[] | undefined;
        indentationLevel: number;
    }): FdrSnippetTemplate.Template | undefined {
        const td = this.endpointContext.type.getTypeDeclaration(typeName);
        const generatedType = this.endpointContext.type.getGeneratedType(typeName);
        return td.shape._visit<FdrSnippetTemplate.Template | undefined>({
            enum: (etd) =>
                this.getEnumTemplate({
                    etd,
                    generatedEnum: generatedType as GeneratedEnumType<SdkContext>,
                    name,
                    location,
                    wireOrOriginalName,
                    nameBreadcrumbs
                }),
            alias: (atd) =>
                this.getTemplateFromTypeReference({
                    typeReference: atd.aliasOf,
                    name,
                    location,
                    wireOrOriginalName,
                    nameBreadcrumbs,
                    indentationLevel
                }),
            object: (otd) =>
                this.getObjectTemplate({
                    name,
                    otd,
                    location,
                    wireOrOriginalName,
                    nameBreadcrumbs,
                    indentationLevel
                }),
            // This is likely just calling get object template on every member
            union: (utd) =>
                this.getUnionTemplate({
                    utd,
                    name,
                    location,
                    wireOrOriginalName,
                    nameBreadcrumbs,
                    indentationLevel
                }),
            undiscriminatedUnion: () => undefined,
            _other: () => undefined
        });
    }

    private getContainerTemplate({
        containerType,
        name,
        location,
        wireOrOriginalName,
        nameBreadcrumbs,
        indentationLevel
    }: {
        containerType: ContainerType;
        name: string | undefined;
        location: FdrSnippetTemplate.PayloadLocation;
        wireOrOriginalName: string | undefined;
        nameBreadcrumbs: string[] | undefined;
        indentationLevel: number;
    }): FdrSnippetTemplate.Template | undefined {
        const childIndentationLevel = indentationLevel + 1;
        const selfTabs = "\t".repeat(indentationLevel);
        const childTabs = "\t".repeat(childIndentationLevel);
        const immediatePayloadPath = this.getBreadCrumbPath({ wireOrOriginalName, nameBreadcrumbs });
        return containerType._visit<FdrSnippetTemplate.Template | undefined>({
            list: (itemType) => {
                const innerTemplate = this.getTemplateFromTypeReference({
                    typeReference: itemType,
                    name: undefined,
                    location: FdrSnippetTemplate.PayloadLocation.Relative,
                    wireOrOriginalName: undefined,
                    nameBreadcrumbs: undefined,
                    indentationLevel: childIndentationLevel
                });
                return innerTemplate != null
                    ? FdrSnippetTemplate.Template.iterable({
                          imports: [],
                          isOptional: true,
                          containerTemplateString: this.getAsNamedParameterTemplate(
                              name,
                              `[\n${childTabs}${TEMPLATE_SENTINEL}\n${selfTabs}]`
                          ),
                          delimiter: `,\n${childTabs}`,
                          innerTemplate,
                          templateInput: FdrSnippetTemplate.TemplateInput.payload({
                              location,
                              path: immediatePayloadPath
                          })
                      })
                    : undefined;
            },
            set: (itemType) => {
                const innerTemplate = this.getTemplateFromTypeReference({
                    typeReference: itemType,
                    name: undefined,
                    location: FdrSnippetTemplate.PayloadLocation.Relative,
                    wireOrOriginalName: undefined,
                    nameBreadcrumbs: undefined,
                    indentationLevel: childIndentationLevel
                });

                return innerTemplate != null
                    ? FdrSnippetTemplate.Template.iterable({
                          imports: [],
                          isOptional: true,
                          containerTemplateString: this.getAsNamedParameterTemplate(
                              name,
                              `new Set([\n${childTabs}${TEMPLATE_SENTINEL}\n${selfTabs}])`
                          ),
                          delimiter: `,\n${childTabs}`,
                          innerTemplate,
                          templateInput: FdrSnippetTemplate.TemplateInput.payload({
                              location,
                              path: immediatePayloadPath
                          })
                      })
                    : undefined;
            },
            map: (kvType) => {
                const keyTemplate = this.getTemplateFromTypeReference({
                    typeReference: kvType.keyType,
                    name: undefined,
                    location: FdrSnippetTemplate.PayloadLocation.Relative,
                    wireOrOriginalName: undefined,
                    nameBreadcrumbs: undefined,
                    indentationLevel: childIndentationLevel
                });
                const valueTemplate = this.getTemplateFromTypeReference({
                    typeReference: kvType.valueType,
                    name: undefined,
                    location: FdrSnippetTemplate.PayloadLocation.Relative,
                    wireOrOriginalName: undefined,
                    nameBreadcrumbs: undefined,
                    indentationLevel: childIndentationLevel
                });

                return keyTemplate != null && valueTemplate != null
                    ? FdrSnippetTemplate.Template.dict({
                          imports: [],
                          isOptional: true,
                          containerTemplateString: this.getAsNamedParameterTemplate(
                              name,
                              `{\n${childTabs}${TEMPLATE_SENTINEL}\n${selfTabs}}`
                          ),
                          delimiter: `,\n${childTabs}`,
                          keyValueSeparator: ": ",
                          keyTemplate,
                          valueTemplate,
                          templateInput: FdrSnippetTemplate.TemplateInput.payload({
                              location,
                              path: immediatePayloadPath
                          })
                      })
                    : undefined;
            },
            optional: (optionalType) =>
                this.getTemplateFromTypeReference({
                    typeReference: optionalType,
                    name,
                    location,
                    wireOrOriginalName,
                    nameBreadcrumbs,
                    indentationLevel
                }),
            literal: () => undefined,
            _other: () => undefined
        });
    }

    private getTemplateFromTypeReference({
        typeReference,
        name,
        location,
        wireOrOriginalName,
        nameBreadcrumbs,
        indentationLevel
    }: {
        typeReference: TypeReference;
        name: string | undefined;
        location: FdrSnippetTemplate.PayloadLocation;
        wireOrOriginalName: string | undefined;
        nameBreadcrumbs: string[] | undefined;
        indentationLevel: number;
    }): FdrSnippetTemplate.Template | undefined {
        // Do not insert literals into templates
        if (typeReference.type === "container" && typeReference.container.type === "literal") {
            return;
        }
        // TODO: Implement a better way to handle type -> template relation to better handle
        // circular references
        if (indentationLevel > 10) {
            return;
        }

        return typeReference._visit({
            primitive: () => this.getBaseGenericTemplate({ name, location, wireOrOriginalName, nameBreadcrumbs }),
            unknown: () => this.getBaseGenericTemplate({ name, location, wireOrOriginalName, nameBreadcrumbs }),
            container: (containerType) =>
                this.getContainerTemplate({
                    containerType,
                    name,
                    location,
                    wireOrOriginalName,
                    nameBreadcrumbs,
                    indentationLevel
                }),
            named: (typeName) =>
                this.getNamedTypeTemplate({
                    typeName,
                    name,
                    location,
                    wireOrOriginalName,
                    nameBreadcrumbs,
                    indentationLevel
                }),
            _other: () => undefined
        });
    }

    private getTemplateInputFromTemplate(template: FdrSnippetTemplate.Template): FdrSnippetTemplate.TemplateInput {
        return FdrSnippetTemplate.TemplateInput.template(template);
    }

    private getTemplateInputFromTypeReference(args: {
        typeReference: TypeReference;
        name: string | undefined;
        location: FdrSnippetTemplate.PayloadLocation;
        wireOrOriginalName: string | undefined;
        nameBreadcrumbs: string[] | undefined;
        indentationLevel: number;
    }): FdrSnippetTemplate.TemplateInput | undefined {
        const template = this.getTemplateFromTypeReference(args);
        return template != null ? this.getTemplateInputFromTemplate(template) : template;
    }

    private getNonRequestParametersFromEndpoint(): FdrSnippetTemplate.TemplateInput[] {
        const nrp: FdrSnippetTemplate.TemplateInput[] = [];
        this.endpoint.allPathParameters.forEach((pathParameter) => {
            const pt = this.getTemplateInputFromTypeReference({
                typeReference: pathParameter.valueType,
                name: undefined,
                location: FdrSnippetTemplate.PayloadLocation.Path,
                wireOrOriginalName: pathParameter.name.originalName,
                nameBreadcrumbs: undefined,
                indentationLevel: 1
            });
            if (pt != null) {
                nrp.push(pt);
            }
        });

        return nrp;
    }

    private getRequestParametersFromEndpoint(): FdrSnippetTemplate.TemplateInput[] {
        const nrp: FdrSnippetTemplate.TemplateInput[] = [];
        this.endpoint.queryParameters.forEach((pathParameter) => {
            const pt = this.getTemplateInputFromTypeReference({
                typeReference: pathParameter.valueType,
                name: this.getPropertyKey(pathParameter.name.name),
                location: FdrSnippetTemplate.PayloadLocation.Query,
                wireOrOriginalName: pathParameter.name.wireValue,
                nameBreadcrumbs: undefined,
                indentationLevel: 2
            });
            if (pt != null) {
                nrp.push(pt);
            }
        });

        this.endpoint.headers.forEach((header) => {
            const pt = this.getTemplateInputFromTypeReference({
                typeReference: header.valueType,
                name: this.getPropertyKey(header.name.name),
                location: FdrSnippetTemplate.PayloadLocation.Headers,
                wireOrOriginalName: header.name.wireValue,
                nameBreadcrumbs: undefined,
                indentationLevel: 2
            });
            if (pt != null) {
                nrp.push(pt);
            }
        });

        const rbpt = this.endpoint.requestBody?._visit<(FdrSnippetTemplate.TemplateInput | undefined)[] | undefined>({
            // These two are handled the same way, get the parameters and map them
            inlinedRequestBody: (irb) =>
                irb.properties.map((prop) =>
                    this.getTemplateInputFromTypeReference({
                        typeReference: prop.valueType,
                        name: this.getPropertyKey(prop.name.name),
                        location: FdrSnippetTemplate.PayloadLocation.Body,
                        wireOrOriginalName: prop.name.wireValue,
                        nameBreadcrumbs: undefined,
                        indentationLevel: 2
                    })
                ),
            reference: (ref) => [
                this.getTemplateInputFromTypeReference({
                    typeReference: ref.requestBodyType,
                    location: FdrSnippetTemplate.PayloadLocation.Body,
                    name: undefined,
                    wireOrOriginalName: undefined,
                    nameBreadcrumbs: undefined,
                    indentationLevel: 2
                })
            ],
            fileUpload: (fu) =>
                fu.properties.flatMap((prop) =>
                    prop._visit<FdrSnippetTemplate.TemplateInput | undefined>({
                        file: (file) =>
                            file._visit({
                                file: (f) => this.getTemplateInputFromTemplate(this.fileUploadTemplate(f.key)),
                                fileArray: (fa) =>
                                    this.getTemplateInputFromTemplate(this.fileUploadArrayTemplate(fa.key)),
                                _other: () => undefined
                            }),
                        bodyProperty: (bp) =>
                            this.getTemplateInputFromTypeReference({
                                typeReference: bp.valueType,
                                name: this.getPropertyKey(bp.name.name),
                                location: FdrSnippetTemplate.PayloadLocation.Body,
                                wireOrOriginalName: bp.name.wireValue,
                                nameBreadcrumbs: undefined,
                                indentationLevel: 2
                            }),
                        _other: () => undefined
                    })
                ),
            // Bytes currently not supported
            bytes: () => undefined,
            // No sense in throwing, just ignore this.
            _other: () => undefined
        });
        if (rbpt != null) {
            for (const ti of rbpt) {
                if (ti != null) {
                    nrp.push(ti);
                }
            }
        }

        return nrp;
    }

    private fileUploadArrayTemplate(key: NameAndWireValue) {
        return FdrSnippetTemplate.Template.iterable({
            isOptional: true,
            containerTemplateString: `[\n\t\t${TEMPLATE_SENTINEL}\n\t]`,
            delimiter: ",\n\t\t",
            innerTemplate: this.fileUploadTemplate(key, true),
            templateInput: FdrSnippetTemplate.TemplateInput.payload({
                location: FdrSnippetTemplate.PayloadLocation.Body,
                path: key.wireValue
            })
        });
    }

    private fileUploadTemplate(key: NameAndWireValue, isNested?: boolean) {
        return FdrSnippetTemplate.Template.generic({
            imports: ['import fs from "fs";'],
            templateString: `fs.createReadStream('${TEMPLATE_SENTINEL}')`,
            isOptional: false,
            templateInputs:
                isNested !== true
                    ? [
                          FdrSnippetTemplate.TemplateInput.payload({
                              location: FdrSnippetTemplate.PayloadLocation.Body,
                              path: key.wireValue
                          })
                      ]
                    : []
        });
    }

    // Should take in all params, filter out request to put at the back
    // Then create type reference templates for everything
    // Then make the request param manual to ensure that it acts like a hash
    private generateTopLevelSnippetTemplateInput(): FdrSnippetTemplate.TemplateInput[] {
        const topLevelTemplateInputs: FdrSnippetTemplate.TemplateInput[] = [];
        // TS params are essentially going to be ordered, if they're not named request then they're going to go in loose (no name)
        // if they're in the request object then they're named within this hash (this.requestExample)
        // path parameters matter since they are unnamed, if they're not present undefined is required
        // Generally its: (`path parameters`, {`request parameter`}}

        // Add the unnamed, non-request params first
        const nonRequestParamInputs = this.getNonRequestParametersFromEndpoint();
        if (nonRequestParamInputs.length > 0) {
            topLevelTemplateInputs.push(
                FdrSnippetTemplate.TemplateInput.template(
                    FdrSnippetTemplate.Template.generic({
                        imports: [],
                        templateString: TEMPLATE_SENTINEL,
                        isOptional: false,
                        inputDelimiter: ",\n\t",
                        templateInputs: this.getNonRequestParametersFromEndpoint()
                    })
                )
            );
        }

        // Finally, if there's a request param, build that.
        const requestParamInputs = this.getRequestParametersFromEndpoint();
        if (requestParamInputs.length > 0) {
            topLevelTemplateInputs.push(
                FdrSnippetTemplate.TemplateInput.template(
                    FdrSnippetTemplate.Template.generic({
                        imports: [],
                        templateString: `{\n\t\t${TEMPLATE_SENTINEL}\n\t}`,
                        isOptional: true,
                        inputDelimiter: ",\n\t\t",
                        templateInputs: this.getRequestParametersFromEndpoint()
                    })
                )
            );
        }
        return topLevelTemplateInputs;
    }

    // TODO: share this logic with SdkGenerator
    private getEndpointFunctionName(endpoint: HttpEndpoint): string {
        return endpoint.name.camelCase.unsafeName;
    }

    public generateSnippetTemplate(): FdrSnippetTemplate.VersionedSnippetTemplate | undefined {
        const project = new Project({
            useInMemoryFileSystem: true
        });
        const clientInstantiationSourceFile = project.createSourceFile("snippet");
        const ciImportsManager = new ImportsManager();

        const clientInstantiation = this.clientContext.sdkClientClass
            .getGeneratedSdkClientClass(this.rootPackageId)
            .instantiateAsRoot({ context: this.clientContext, npmPackage: this.npmPackage });
        const clientAssignment = ts.factory.createVariableStatement(
            undefined,
            ts.factory.createVariableDeclarationList(
                [
                    ts.factory.createVariableDeclaration(
                        this.clientContext.sdkInstanceReferenceForSnippet,
                        undefined,
                        undefined,
                        clientInstantiation
                    )
                ],
                ts.NodeFlags.Const
            )
        );
        // Create the client instantiation snippet
        clientInstantiationSourceFile.addStatements([getTextOfTsNode(clientAssignment)]);
        ciImportsManager.writeImportsToSourceFile(clientInstantiationSourceFile);
        const clientInstantiationString = clientInstantiationSourceFile.getText();

        // Recurse over the parameters to the function
        const topLevelTemplateInputs = this.generateTopLevelSnippetTemplateInput();

        // Create the outer function snippet
        const clientClass = this.clientContext.sdkClientClass.getGeneratedSdkClientClass(this.packageId);
        const endpointClientAccess = clientClass.accessFromRootClient({
            referenceToRootClient: this.clientContext.sdkInstanceReferenceForSnippet
        });
        const endpointClientAccessString = getTextOfTsNode(endpointClientAccess);
        const templateString =
            topLevelTemplateInputs.length > 0
                ? `await ${endpointClientAccessString}.${this.getEndpointFunctionName(
                      this.endpoint
                  )}(\n\t${TEMPLATE_SENTINEL}\n)`
                : `await ${endpointClientAccessString}.${this.getEndpointFunctionName(this.endpoint)}()`;
        return FdrSnippetTemplate.VersionedSnippetTemplate.v1({
            clientInstantiation: clientInstantiationString,
            functionInvocation: FdrSnippetTemplate.Template.generic({
                imports: [],
                templateString,
                isOptional: false,
                inputDelimiter: ",\n\t",
                templateInputs: topLevelTemplateInputs
            })
        });
    }
}
