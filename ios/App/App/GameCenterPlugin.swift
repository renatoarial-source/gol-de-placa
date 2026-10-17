import Capacitor
import GameKit

/// Game Center (só iPhone): login, conquistas (as figurinhas do álbum) e ranking de gols.
@objc(GameCenterPlugin)
public class GameCenterPlugin: CAPPlugin, CAPBridgedPlugin, GKGameCenterControllerDelegate {
    public let identifier = "GameCenterPlugin"
    public let jsName = "GameCenter"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "signIn", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "reportAchievements", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "submitScore", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "show", returnType: CAPPluginReturnPromise),
    ]

    private var signInCalls: [CAPPluginCall] = []
    private var handlerSet = false

    @objc func signIn(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if GKLocalPlayer.local.isAuthenticated {
                call.resolve(["authenticated": true])
                return
            }
            self.signInCalls.append(call)
            if self.handlerSet { return }
            self.handlerSet = true
            // A Apple chama este bloco de novo quando o jogador entra ou sai do Game Center.
            GKLocalPlayer.local.authenticateHandler = { [weak self] viewController, _ in
                guard let self = self else { return }
                if let vc = viewController {
                    self.bridge?.viewController?.present(vc, animated: true)
                    return
                }
                let ok = GKLocalPlayer.local.isAuthenticated
                let pending = self.signInCalls
                self.signInCalls.removeAll()
                for c in pending { c.resolve(["authenticated": ok]) }
                self.notifyListeners("authChange", data: ["authenticated": ok])
            }
        }
    }

    @objc func reportAchievements(_ call: CAPPluginCall) {
        let ids = call.getArray("ids", String.self) ?? []
        guard GKLocalPlayer.local.isAuthenticated, !ids.isEmpty else { call.resolve(); return }
        let list = ids.map { id -> GKAchievement in
            let a = GKAchievement(identifier: id)
            a.percentComplete = 100
            a.showsCompletionBanner = call.getBool("banner") ?? true
            return a
        }
        GKAchievement.report(list) { error in
            if let error = error { call.reject(error.localizedDescription) } else { call.resolve() }
        }
    }

    @objc func submitScore(_ call: CAPPluginCall) {
        guard let board = call.getString("leaderboard"), let score = call.getInt("score") else {
            call.reject("leaderboard e score são obrigatórios"); return
        }
        guard GKLocalPlayer.local.isAuthenticated else { call.resolve(); return }
        GKLeaderboard.submitScore(score, context: 0, player: GKLocalPlayer.local, leaderboardIDs: [board]) { error in
            if let error = error { call.reject(error.localizedDescription) } else { call.resolve() }
        }
    }

    @objc func show(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard GKLocalPlayer.local.isAuthenticated else { call.resolve(["shown": false]); return }
            let state: GKGameCenterViewControllerState
            switch call.getString("view") {
            case "leaderboards": state = .leaderboards
            case "achievements": state = .achievements
            default: state = .dashboard
            }
            let vc = GKGameCenterViewController(state: state)
            vc.gameCenterDelegate = self
            self.bridge?.viewController?.present(vc, animated: true)
            call.resolve(["shown": true])
        }
    }

    public func gameCenterViewControllerDidFinish(_ gameCenterViewController: GKGameCenterViewController) {
        gameCenterViewController.dismiss(animated: true)
    }
}
