import Browser from 'webextension-polyfill';

class ZestScript {
  zestStatements: string[] = [];

  curIndex = 1;

  title: string;

  constructor(title = '') {
    this.title = title;
  }

  addStatement(statement: string): void {
    const zestStatement = JSON.parse(statement);
    zestStatement.index = this.getNextIndex();
    this.zestStatements.push(JSON.stringify(zestStatement));
  }

  getNextIndex(): number {
    this.curIndex += 1;
    return this.curIndex - 1;
  }

  reset(): void {
    this.zestStatements = [];
    this.curIndex = 1;
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

  downloadZestScript(): void {
    Browser.tabs.query({active: true, currentWindow: true}).then((tabs) => {
      const activeTab = tabs[0];
      if (activeTab?.id) {
        Browser.tabs.sendMessage(activeTab.id, {
          type: 'saveZestScript',
          data: {script: this.toJSON(), title: this.title},
        });
      }
    });
  }
}

export {ZestScript};
