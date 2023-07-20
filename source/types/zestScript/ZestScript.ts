interface ZestScriptMessage {
  script: string;
  title: string;
}

class ZestScript {
  private zestStatements: string[] = [];

  private curIndex = 1;

  private title: string;

  constructor(title = '') {
    this.title = title;
  }

  addStatement(statement: string): string {
    const zestStatement = JSON.parse(statement);
    zestStatement.index = this.getNextIndex();
    this.zestStatements.push(JSON.stringify(zestStatement));
    return JSON.stringify(zestStatement);
  }

  getNextIndex(): number {
    this.curIndex += 1;
    return this.curIndex - 1;
  }

  reset(): void {
    this.zestStatements = [];
    this.curIndex = 1;
  }

  getZestStatementCount(): number {
    return this.zestStatements.length;
  }

  getTitle(): string {
    return this.title;
  }

  toJSON(): string {
    return JSON.stringify(
      {
        about:
          'This is a Zest script. For more details about Zest visit https://github.com/zaproxy/zest/',
        zestVersion: '0.3',
        title: 'recordedScript',
        description: '',
        prefix: '',
        type: 'StandAlone',
        parameters: {
          tokenStart: '{{',
          tokenEnd: '}}',
          tokens: {},
          elementType: 'ZestVariables',
        },
        statements: this.zestStatements.map((statement) =>
          JSON.parse(statement)
        ),
        authentication: [],
        index: 0,
        enabled: true,
        elementType: 'ZestScript',
      },
      null,
      2
    );
  }

  getZestScript(): ZestScriptMessage {
    return {script: this.toJSON(), title: this.title};
  }
}

export {ZestScript};
export type {ZestScriptMessage};
