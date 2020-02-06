import Model, {DataTypes, registerConnection} from './model';
import DataRepository from './DataRepository';


export {
	registerConnection as registerMysqlConnection,
	DataTypes as MysqlDataTypes,
	Model as MysqlModel,
	DataRepository as MysqlDataRepository
}