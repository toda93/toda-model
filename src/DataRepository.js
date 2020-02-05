class DataRepository {
    constructor(model, fks = []) {
        this.model = model;
        this.fks = fks;
    }

    async getAll(options = {}) {
        return await this.model.get(options);
    }
    async getOne(options = {}) {
        return this.model.first(options);
    }

    async getOneBy(key, value) {
        return this.model.firstByAttr(key, value);
    }
    async getOneBySlugOrKey(value) {
        return this.getOne({
            where: {
                $or: [
                    {slug: value},
                    {key: value}
                ]
            }
        });
    }

    async create(data, guard = []) {
        const item = new this.model();
        return this._save(item, data, guard);
    }
    async createWithMetadata(data, guard = []) {
        if (data.images && _.isString(data.images)) {
            data.images = JSON.parse(data.images);
            data.thumb = data.images.thumb;
        }

        if (data.thumb && _.isString(data.thumb)) {
            data.thumb = JSON.parse(data.thumb);
        }
        data.metadata_title = data.metadata_title ? data.metadata_title : data.title;
        data.metadata_keywords = data.metadata_keywords ? data.metadata_keywords : data.title;
        data.metadata_description = data.metadata_description ? data.metadata_description : (data.text_intro ? data.text_intro : data.title);
        data.metadata_image_url = data.metadata_image_url ? data.metadata_image_url : (data.thumb && data.thumb.original ? data.thumb.original : '');
        return this.create(data, guard);
    }

    async update(id, data, guard = []) {
        const item = await this.getOneBy('id', id);
        return this._save(item, data, guard);
    }
    async updateAll(data, options) {
        return this.model.update(data, options);
    }

    async addUnique(attr, data) {
        let item = await this.model.firstByAttr(attr, data[attr]);
        if (item) {
            return this.update(item.id, data);
        } else {
            return this.create(data);
        }
    }

    async delete(id, force = false) {
        const item = await this.getOneBy('id', id);
        if (item) {
            if (!force) {
                for (let i = 0; i < this.fks.length; ++i) {
                    const fk = this.fks[i];
                    const model = models[fk.model];
                    const count = await model.count({
                        where: {
                            [fk.foreignKey]: id
                        }
                    });
                    if (count > 0) {
                        throw new ErrorException(EXISTS_ITEMS);
                    }
                }
            }
            return await item.destroy();
        }
        return null;

    }

    async getTotalItem(options = {}) {
        return this.model.count(options);
    }

    async runTransaction(callback) {
        return this.model.runTransaction(callback);
    }
    async beforeLoadData(data) {
        return data;
    }
    async _save(item, data, guard = []) {
        data = await this.beforeLoadData(data);
        item.loadData(data, [
            'created_at',
            'updated_at',
            '_transaction',
            ...guard
        ]);
        if (data._transaction) {
            return await item.save({transaction: data._transaction});
        }
        return await item.save();
    }

}

export default DataRepository;
