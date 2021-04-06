import _ from 'lodash';
import { ErrorException, NOT_INIT_METHOD } from '@azteam/error';

function registerConnection(name, config) {
    try {
        return mongoose.createConnection(url, options);
    } catch (e) {
        conssole.log('error', e);
    }
}

class Provider {
    constructor(configs) {
        this.configs = configs;
        this.connections = {};
        this.model = {};
    }

    closeAll() {
        _.map(this.connections, (connection) => {
            connection.close();
        });
    }

    bindingModel(model) {
        if (!this.model[model.name]) {
            const dbName = model.database_name;
            const connection = this._getConnection(dbName);
            this.model[model.name] = model.register(connection);
        }
        return this.model[model.name];
    }

    _getConnection(name) {
        if (!this.connections[name]) {
            this.connections[name] = registerConnection(name, this.configs[name]);
        }
        return this.connections[name];
    }

}

export default Provider;