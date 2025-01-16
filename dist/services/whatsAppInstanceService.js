"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WhatsAppInstanceManager = void 0;
const database_1 = __importDefault(require("../config/database"));
const externalWebSocket_1 = require("./externalWebSocket");
class WhatsAppInstanceManager {
    constructor(internalIo) {
        this.instances = new Map();
        this.checkInterval = null;
        this.UPDATE_INTERVAL = 300000; // 30 segundos
        this.internalIo = internalIo;
        this.initialize();
    }
    async initialize() {
        await this.initializeInstances();
        this.startPeriodicCheck();
    }
    async initializeInstances() {
        try {
            const activeInstances = await database_1.default.whatsAppInstance.findMany({
                where: {
                    status: 'open'
                }
            });
            console.log('Active instances:', activeInstances);
            for (const instance of activeInstances) {
                await this.createInstanceConnection(instance);
            }
            console.log(`Initialized ${activeInstances.length} WhatsApp instances`);
        }
        catch (error) {
            console.error('Error initializing WhatsApp instances:', error);
        }
    }
    startPeriodicCheck() {
        console.log('Iniciando verificação periódica...');
        // Garantir que não há outro intervalo rodando
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
        }
        // Criar novo intervalo
        this.checkInterval = setInterval(() => {
            console.log('Executando verificação periódica...');
            this.checkForNewInstances()
                .catch(error => console.error('Erro durante verificação periódica:', error));
        }, this.UPDATE_INTERVAL);
        console.log(`Verificação periódica configurada para cada ${this.UPDATE_INTERVAL / 1000} segundos`);
    }
    async checkForNewInstances() {
        try {
            console.log('Buscando instâncias no banco de dados...');
            const dbInstances = await database_1.default.whatsAppInstance.findMany({
                where: {
                    status: 'open'
                }
            });
            console.log(`Encontradas ${dbInstances.length} instâncias ativas no banco`);
            console.log(`Instâncias atuais em memória: ${Array.from(this.instances.keys()).join(', ')}`);
            // Verificar novas instâncias
            for (const dbInstance of dbInstances) {
                if (!this.instances.has(dbInstance.instanceName)) {
                    console.log(`Nova instância encontrada: ${dbInstance.instanceName}`);
                    await this.createInstanceConnection(dbInstance);
                }
                else {
                    console.log(`Instância já existente: ${dbInstance.instanceName}`);
                }
            }
            // Verificar instâncias removidas
            const activeInstanceNames = dbInstances.map(i => i.instanceName);
            for (const [instanceName, instance] of this.instances.entries()) {
                if (!activeInstanceNames.includes(instanceName)) {
                    console.log(`Instância removida detectada: ${instanceName}`);
                    await this.removeInstance(instanceName);
                }
            }
            console.log('Verificação periódica concluída');
        }
        catch (error) {
            console.error('Erro ao verificar novas instâncias:', error);
        }
    }
    async createInstanceConnection(instance) {
        try {
            const wsService = new externalWebSocket_1.ExternalWebSocketService(this.internalIo, `https://evolution.rubnik.com/${instance.instanceName}`);
            this.instances.set(instance.instanceName, wsService);
            console.log(`Connected to instance: ${instance.instanceName}`);
            return wsService;
        }
        catch (error) {
            console.error(`Error connecting to instance ${instance.instanceName}:`, error);
            throw error;
        }
    }
    async addInstance(instanceData) {
        try {
            const newInstance = await database_1.default.whatsAppInstance.create({
                data: {
                    instanceName: instanceData.instanceName,
                    displayName: instanceData.instanceName.split('-')[0],
                    instanceId: instanceData.instanceName,
                    status: 'open',
                    integration: 'WHATSAPP-BAILEYS',
                    serverUrl: instanceData.serverUrl,
                    teamId: instanceData.teamId,
                    agentId: instanceData.agentId
                }
            });
            await this.createInstanceConnection(newInstance);
            return newInstance;
        }
        catch (error) {
            console.error('Error adding WhatsApp instance:', error);
            throw error;
        }
    }
    async removeInstance(instanceName) {
        try {
            const instance = this.instances.get(instanceName);
            if (instance) {
                instance.disconnect();
                this.instances.delete(instanceName);
                await database_1.default.whatsAppInstance.update({
                    where: { instanceName },
                    data: { status: 'closed' }
                });
                console.log(`Instance ${instanceName} removed successfully`);
            }
        }
        catch (error) {
            console.error(`Error removing instance ${instanceName}:`, error);
            throw error;
        }
    }
    getActiveInstances() {
        return Array.from(this.instances.keys());
    }
    getInstance(instanceName) {
        return this.instances.get(instanceName);
    }
    stopPeriodicCheck() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
            console.log('Verificação periódica interrompida');
        }
    }
}
exports.WhatsAppInstanceManager = WhatsAppInstanceManager;
