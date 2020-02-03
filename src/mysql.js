import _ from 'lodash';
import sanitizeHtml from 'sanitize-html';
import { Sequelize, Validator, Op, DataTypes } from 'sequelize';
import {
    ErrorException,
    EMAIL_FORMAT,
    INT_FORMAT,
    JSON_FORMAT,
    NOT_EMPTY,
    PHONE_NUMBER_FORMAT,
    SLUG_FORMAT
} from 'toda-error';





function sanitize(content) {
    content = sanitizeHtml(content, {
        allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'span', 'h2', 'article']),
        allowedAttributes: {
            a: ['href', 'name', 'target'],
            img: ['src', 'alt', 'title'],
            iframe: ['src'],
            '*': ['style'],
        },
        allowedStyles: {
            '*': {
                // Match HEX and RGB
                'color': [/^\#(0x)?[0-9a-f]+$/i, /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/],
                'text-align': [/^left$/, /^right$/, /^center$/],
                // Match any number with px, em, or %
                'font-size': [/^\d+(?:px|em|%)$/],
                'line-height': [/^.*$/],
                'font-style': [/^.*$/],
                'font-family': [/^.*$/],
                'font-weight': [/^bold$/],
            }
        },
        allowedIframeHostnames: ['www.youtube.com']
    });
    return minify(content.trim(), {
        collapseWhitespace: true
    });
}


function registerConnection(config) {
    return new Sequelize(config, null, null, {
        operatorsAliases: {
            $eq: Op.eq,
            $ne: Op.ne,
            $gte: Op.gte,
            $gt: Op.gt,
            $lte: Op.lte,
            $lt: Op.lt,
            $not: Op.not,
            $in: Op.in,
            $notIn: Op.notIn,
            $is: Op.is,
            $like: Op.like,
            $notLike: Op.notLike,
            $iLike: Op.iLike,
            $notILike: Op.notILike,
            $regexp: Op.regexp,
            $notRegexp: Op.notRegexp,
            $iRegexp: Op.iRegexp,
            $notIRegexp: Op.notIRegexp,
            $between: Op.between,
            $notBetween: Op.notBetween,
            $contains: Op.contains,
            $contained: Op.contained,
            $and: Op.and,
            $or: Op.or,
            $any: Op.any,
            $all: Op.all,
        },
        dialect: 'mysql',
        port: 3306,
        replication: {
            read: config.slave,
            write: config.master
        },
        pool: {
            max: 10,
            min: 0,
            acquire: 30000,
            idle: 10000
        },
        logging: (process.env.NODE_ENV === 'development'),
    });
}

class MysqlModel extends Sequelize.Model {
    static register(connection) {
        const options = {
            tableName: this.table_name,
            timestamps: false,
            sequelize: connection,
            hooks: {
                beforeCreate: (model, options) => {
                    model.created_at = model.updated_at = Math.floor(Date.now() / 1000);
                    if (typeof model._beforeCreate === 'function') {
                        model._beforeCreate();
                    }
                },

                beforeUpdate: (model, options) => {
                    if (model.changed()) {
                        if (!model.disableUpdatedAt) {
                            model.updated_at = Math.floor(Date.now() / 1000);
                        }
                    }
                    if (typeof model._beforeUpdate === 'function') {
                        model._beforeUpdate();
                    }
                },

                beforeSave: (model, options) => {
                    _.filter(model.attributes, attr => attr.includes('html_')).map(key => {
                        model[key] = sanitize(model[key]);
                    });
                },
            },
        };



        return super.init(
            this._defaultValueAndValidate(this.col_attributes),
            options
        );
    }

    loadData(data, guard = []) {
        for (const key in data) {
            if (!guard.includes(key) && !_.isUndefined(data[key]) && _.isUndefined(this.attributes[key])) {
                let value = data[key];
                if (typeof value === 'object' || Array.isArray(value)) {
                    value = JSON.stringify(value);
                }
                this.setDataValue(key, value);
            }
        }
        return this;
    }

    static _defaultValueAndValidate(attributes) {
        for (const attributeName in attributes) {
            const attrDef = attributes[attributeName];
            attrDef.allowNull = false;
            attrDef.allowEmpty = attrDef.allowEmpty === false ? false : true;

            if (!attrDef.autoIncrement) {
                let defaultValue = 0;
                let defaultValidate = !_.isUndefined(attrDef.validate) ? attrDef.validate : {};

                switch (attrDef.type.key) {
                    case 'INTEGER':
                        defaultValue = 0;
                        defaultValidate.isInt = {
                            msg: INT_FORMAT
                        };
                        break;
                    case 'STRING':
                        defaultValue = '';
                        switch (attributeName) {
                            case 'email':
                                defaultValidate.isEmail = {
                                    msg: EMAIL_FORMAT
                                };
                                break;
                            case 'slug':
                                defaultValidate.is = {
                                    args: /^[a-zA-Z0-9-_]+$/i,
                                    msg: SLUG_FORMAT
                                };
                                break;
                            case 'phone_number':
                                defaultValidate['phoneNumberVN'] = (value) => {
                                    value = value.replace(/[-. ]/g, '');
                                    const phone_regex = /((09|03|07|08|05)+([0-9]{8})\b)/g;
                                    if (!phone_regex.test(value)) {
                                        throw new ErrorException(PHONE_NUMBER_FORMAT);
                                    }
                                };
                        }
                        break;
                    default:
                        break;
                }


                if (attrDef.allowJSON) {
                    defaultValidate.isJSON = {
                        msg: JSON_FORMAT
                    };

                    attrDef.get = function() {
                        const value = this.getDataValue(attributeName);

                        if (typeof value === 'string') {
                            return JSON.parse(value);
                        }
                        return value;
                    };

                    attrDef.set = function(value) {
                        if (typeof value === 'object' || Array.isArray(value)) {
                            value = JSON.stringify(value);
                        }
                        this.setDataValue(attributeName, value);
                    };
                }

                if (!attrDef.allowEmpty) {
                    defaultValidate.notEmpty = {
                        msg: NOT_EMPTY
                    };
                } else {
                    _.map(defaultValidate, (validate_value, validate_name) => {
                        if (!_.isFunction(validate_value)) {
                            defaultValidate[validate_name + 'AndAllowEmpty'] = (value) => {
                                if (!_.isEmpty(value) && !Validator[validate_name](value)) {
                                    throw new ErrorException(validate_value.msg);
                                }
                            };
                        } else {
                            defaultValidate[validate_name + 'AndAllowEmpty'] = (value) => {
                                if (!_.isEmpty(value)) {
                                    return defaultValidate[validate_name];
                                }
                            };
                        }
                        delete defaultValidate[validate_name];

                    });
                }
                attrDef.validate = defaultValidate;
                attrDef.defaultValue = !_.isUndefined(attrDef.defaultValue) ? attrDef.defaultValue : defaultValue;
            }
        }
        return attributes;
    }


    static async first(options = {}) {
        let data = null;
        if (_.isNull(data)) {
            data = await this.findOne(options);
        } else {
            data = this.toSequelize(data);
        }
        return data;
    }

    static firstByAttr(attr, value) {
        return this.first({
            where: {
                [attr]: value,
            }
        });
    }

    static async get(options = {}) {
        let data = null;

        if (_.isNull(data)) {
            if (options.fulltext) {
                let search_key = '';
                let cols = '';
                _.map(options.fulltext, (value, key) => {
                    search_key += ` ${value}`;
                    cols += `\`${this.name}\`.\`${key}\`,`;
                });


                options.where.$and = [
                    Sequelize.literal(`MATCH (${_.trimEnd(cols, ',')}) AGAINST (:search_key IN NATURAL LANGUAGE MODE)`),
                ];

                if (!options.attributes) {
                    options.attributes = _.keys(this.col_attributes);
                }
                options.attributes.push(Sequelize.literal(`MATCH (${_.trimEnd(cols, ',')}) AGAINST (:search_key IN NATURAL LANGUAGE MODE) AS score`));

                options.replacements = {
                    search_key
                };

                if (options.order) {
                    options.order.unshift([Sequelize.literal('score DESC')]);
                }
                options = _.omit(options, ['fulltext']);
            }
            options.limit = (options.limit && options.limit < 1000) ? options.limit : 1000;
            if (options.page) {
                options.offset = (options.page - 1) * options.limit;
                data = await this._getPaging(options);
            } else {
                data = await this.findAll({
                    ...options,
                });

            }
        }
        return data;
    }

    static getByAttr(attr, value) {
        return this.get({
            where: {
                [attr]: value,
            }
        });
    }

    static async _getPaging(options = {}) {
        const rows = await this.findAll(options);
        const total = await this.count(options);
        return {
            page: options.page,
            limit: options.limit,
            total,
            rows,
        }
    }

    static toSequelize(data) {
        if (data && this.name !== data.constructor.name) {
            let include = [];

            for (const key in data) {
                if (key[0] === '_') {
                    include.push(key);
                }
            }

            data = this.build(data, {
                isNewRecord: false,
                include: include
            });

            data._previousDataValues = data.dataValues;
            _.forEach(data._changed, (item, key) => {
                data._changed[key] = false;
            });
        }
        return data;
    }
}

export default MysqlModel;


export {
    DataTypes as MysqlDataTypes,
    registerConnection
}