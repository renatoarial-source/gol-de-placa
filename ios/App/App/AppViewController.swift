import Capacitor

/// Tela do app: o Capacitor com os complementos nativos do próprio jogo.
class AppViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(GameCenterPlugin())
    }
}
